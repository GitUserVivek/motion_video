import { getDb } from '../db/db.js';
import { ttsService } from '../services/tts.service.js';
import { subtitleService } from '../services/subtitle.service.js';
import { storyboardService } from '../services/storyboard.service.js';
import { renderService } from '../services/render.service.js';
import { config } from '../config.js';
import path from 'path';
import fs from 'fs';
import type { VideoConfig, StoryboardPlan } from '@edumotion/shared';

const POLL_INTERVAL_MS = 2000;
let workerTimer: ReturnType<typeof setTimeout> | null = null;
let isProcessing = false;

interface JobRow {
  id: string;
  project_id: string;
  script_id: string;
  config_json: string;
  retry_count: number;
  status: string;
}

interface ScriptRow {
  content: string;
}

function updateJob(
  jobId: string,
  status: string,
  progress: number,
  step: string,
  error?: string,
): void {
  const db = getDb();
  db.prepare(`
    UPDATE jobs
    SET status = ?, progress = ?, current_step = ?, error = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(status, progress, step, error ?? null, jobId);
}

async function processJob(job: JobRow): Promise<void> {
  const db = getDb();
  const videoConfig = JSON.parse(job.config_json) as VideoConfig;

  updateJob(job.id, 'processing', 5, 'generating_audio');
  console.log(`[Worker] Processing job ${job.id}`);

  // 1. Get script content
  const scriptRow = db
    .prepare('SELECT content FROM scripts WHERE id = ?')
    .get(job.script_id) as ScriptRow | undefined;

  if (!scriptRow) throw new Error(`Script not found for job ${job.id}`);

  const script = scriptRow.content;

  // 2. Generate TTS audio
  const audioPath = path.join(config.storage.audioDir, `${job.id}.wav`);
  console.log(`[Worker] Job ${job.id} [1/4] synthesizing audio (${script.length} chars)`);
  const { audioPath: finalAudioPath, durationMs } = await ttsService.synthesize(
    script,
    config.tts.voice,
    audioPath,
  );
  console.log(`[Worker] Job ${job.id} [2/4] subtitles for ${(durationMs / 1000).toFixed(1)}s of audio`);

  updateJob(job.id, 'processing', 20, 'aligning_subtitles');

  // 3. Generate subtitles
  const subtitles = subtitleService.generateSubtitles(script, durationMs);
  const srtPath = path.join(config.storage.subtitlesDir, `${job.id}.srt`);
  const jsonSubPath = path.join(config.storage.subtitlesDir, `${job.id}.json`);
  subtitleService.writeSrt(subtitles, srtPath);
  subtitleService.writeJson(subtitles, jsonSubPath);

  updateJob(job.id, 'processing', 30, 'planning_storyboard');

  // 4. Plan storyboard
  console.log(`[Worker] Job ${job.id} [3/4] planning storyboard (LLM)`);
  const storyboard: StoryboardPlan = await storyboardService.planStoryboard(
    job.id,
    script,
    videoConfig,
    durationMs,
    subtitles,
  );

  // Persist scenes to DB — replace any scenes left by a previous attempt so a
  // shorter retry storyboard cannot leave stale scenes behind.
  db.prepare('DELETE FROM scenes WHERE job_id = ?').run(job.id);
  const insertScene = db.prepare(
    'INSERT INTO scenes (id, job_id, scene_index, instruction_json) VALUES (?, ?, ?, ?)',
  );
  const insertAllScenes = db.transaction(() => {
    storyboard.scenes.forEach((scene, i) => {
      insertScene.run(`${job.id}-scene-${i}`, job.id, i, JSON.stringify(scene));
    });
  });
  insertAllScenes();
  console.log(
    `[Worker] Job ${job.id} storyboard ready: ${storyboard.scenes.length} scenes, ${storyboard.totalFrames} frames`,
  );

  updateJob(job.id, 'processing', 40, 'rendering');

  // 5. Check for cancellation before heavy render
  const jobStatus = db
    .prepare('SELECT status FROM jobs WHERE id = ?')
    .get(job.id) as { status: string } | undefined;
  if (jobStatus?.status === 'cancelled') {
    console.log(`[Worker] Job ${job.id} cancelled before render`);
    return;
  }

  // 6. Render video
  console.log(`[Worker] Job ${job.id} [4/4] rendering`);
  const result = await renderService.renderVideo(
    job.id,
    storyboard,
    finalAudioPath,
    videoConfig,
    (pct) => {
      // Map render progress (0-100) to job progress (40-95)
      const jobPct = 40 + Math.round(pct * 0.55);
      updateJob(job.id, 'processing', jobPct, 'rendering');
    },
  );

  updateJob(job.id, 'processing', 96, 'saving');

  // 7. Save video record to DB
  const videoId = `vid-${job.id}`;
  db.prepare(`
    INSERT INTO videos (id, job_id, file_path, duration_sec, size_bytes, thumbnail_path)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    videoId,
    job.id,
    result.videoPath,
    result.durationSec,
    result.sizeBytes,
    result.thumbnailPath,
  );

  updateJob(job.id, 'completed', 100, 'completed');
  console.log(`[Worker] Job ${job.id} completed. Output: ${result.videoPath}`);
}

async function runWorkerCycle(): Promise<void> {
  if (isProcessing) return;

  const db = getDb();
  const job = db.prepare(`
    SELECT id, project_id, script_id, config_json, retry_count, status
    FROM jobs
    WHERE status = 'pending' AND retry_count <= ?
    ORDER BY created_at ASC
    LIMIT 1
  `).get(config.render.maxRetryCount) as JobRow | undefined;

  // Defensive: never re-run a job that is not pending (a lost filter here would
  // spin on the same job forever).
  if (!job || job.status !== 'pending') return;

  isProcessing = true;

  try {
    await processJob(job);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Worker] Job ${job.id} failed:`, message);

    const retryCount = (job.retry_count ?? 0) + 1;
    const maxRetries = config.render.maxRetryCount;

    if (retryCount <= maxRetries) {
      db.prepare(`
        UPDATE jobs
        SET status = 'pending', retry_count = ?, error = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(retryCount, message, job.id);
      console.log(`[Worker] Job ${job.id} re-queued (attempt ${retryCount}/${maxRetries})`);
    } else {
      updateJob(job.id, 'failed', 0, 'failed', message);
      renderService.cleanupTemp(job.id);
      console.log(`[Worker] Job ${job.id} permanently failed after ${maxRetries} retries`);
    }
  } finally {
    isProcessing = false;
  }
}

export function startRenderWorker(): void {
  console.log('[RenderWorker] Starting job queue worker (poll interval: 2s)');

  // A job left in 'processing' belongs to a previous process that died or was
  // restarted mid-render. Put it back in the queue so it is not stranded.
  const db = getDb();
  const stuck = db.prepare("SELECT id FROM jobs WHERE status = 'processing'").all() as Array<{ id: string }>;
  for (const row of stuck) {
    updateJob(row.id, 'pending', 0, 'requeued');
  }
  if (stuck.length > 0) {
    console.log(`[RenderWorker] Re-queued ${stuck.length} interrupted job(s)`);
  }

  const tick = (): void => {
    runWorkerCycle().catch((err) => {
      console.error('[Worker] Unexpected error in worker cycle:', err);
    });
    workerTimer = setTimeout(tick, POLL_INTERVAL_MS);
  };

  workerTimer = setTimeout(tick, POLL_INTERVAL_MS);
}

export function stopRenderWorker(): void {
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
  console.log('[RenderWorker] Worker stopped');
}
