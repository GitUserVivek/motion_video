import { getDb } from '../db/db.js';
import { ttsService } from '../services/tts.service.js';
import { subtitleService } from '../services/subtitle.service.js';
import { storyboardService } from '../services/storyboard.service.js';
import { renderService } from '../services/render.service.js';
import { qualityService } from '../services/quality.service.js';
import { assetDiscovery } from '../services/asset.discovery.js';
import { resetAssetCache } from '../services/asset.library.js';
import { ensureJobDir, jobFiles } from '../services/job.files.js';
import { config } from '../config.js';
import fs from 'fs';
import { ASPECT_RATIOS, resolveTtsVoice } from '@edumotion/shared';
import type { VideoConfig } from '@edumotion/shared';

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

/** Persist scene render progress so the UI can show "scene 3 / 8". */
function updateSceneProgress(jobId: string, completed: number, total: number): void {
  getDb().prepare(`
    UPDATE jobs
    SET scenes_completed = ?, scenes_total = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(completed, total, jobId);
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

  // 2. Generate TTS audio. Everything for this job is written to
  // output/<jobId>/, so audio, subtitles, report and video stay together.
  ensureJobDir(job.id);
  const audioPath = jobFiles.audio(job.id);
  console.log(`[Worker] Job ${job.id} [1/4] synthesizing audio (${script.length} chars)`);
  // The per-video voice wins over the server default, and preset ids from the
  // UI ('en-US-male-1') are translated into the engine's own voice name.
  const ttsVoice = resolveTtsVoice(videoConfig.voice ?? config.tts.voice);
  console.log(`[Worker] Job ${job.id} voice: ${videoConfig.voice ?? 'default'} -> ${ttsVoice.voice}`);
  const {
    audioPath: finalAudioPath,
    durationMs,
    subtitles: measuredSubtitles,
  } = await ttsService.synthesize(
    script,
    ttsVoice.voice,
    audioPath,
    ttsVoice.engine,
  );
  console.log(`[Worker] Job ${job.id} [2/4] subtitles for ${(durationMs / 1000).toFixed(1)}s of audio`);

  updateJob(job.id, 'processing', 20, 'aligning_subtitles');

  // 3. Generate subtitles
  // edge-tts reports real word boundaries; only estimate from the audio length
  // when the engine cannot provide them (e.g. espeak).
  const subtitles = measuredSubtitles && measuredSubtitles.length > 0
    // edge-tts reports one cue per word; group them into readable phrases while
    // keeping the per-word timings for caption highlighting.
    ? subtitleService.groupWordCues(measuredSubtitles)
    : subtitleService.generateSubtitles(script, durationMs);
  const srtPath = jobFiles.subtitlesSrt(job.id);
  const jsonSubPath = jobFiles.subtitlesJson(job.id);
  subtitleService.writeSrt(subtitles, srtPath);
  subtitleService.writeJson(subtitles, jsonSubPath);

  // 4. Discover illustrations for the script's concepts. This only adds files to
  // the local artwork library; every failure is contained and the built-in SVG
  // glyphs are used instead.
  updateJob(job.id, 'processing', 26, 'discovering_assets');
  const discovery = await assetDiscovery.ensureAssetsForScript(script);
  if (discovery.errors.length > 0) {
    console.warn(`[Worker] Job ${job.id} asset discovery had ${discovery.errors.length} error(s)`);
  }
  // New files are on disk now; drop the 15 s index cache so the storyboard sees
  // them immediately instead of re-using a stale file list.
  resetAssetCache();

  updateJob(job.id, 'processing', 30, 'planning_storyboard');

  // 4. Plan storyboard
  console.log(`[Worker] Job ${job.id} [3/4] planning storyboard (LLM)`);
  const { storyboard, assetUses } = await storyboardService.planStoryboard(
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

  // Persist which artwork each scene took so the render page can show it while
  // the video is still being rendered.
  db.prepare("UPDATE jobs SET assets_json = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(assetUses), job.id);
  console.log(
    `[Worker] Job ${job.id} artwork: ${assetUses.filter((use) => use.source === 'downloaded').length} downloaded, ` +
      `${assetUses.filter((use) => use.source === 'library').length} local, ` +
      `${assetUses.filter((use) => use.source === 'builtin').length} built-in glyph(s)`,
  );
  console.log(
    `[Worker] Job ${job.id} storyboard ready: ${storyboard.scenes.length} scenes, ${storyboard.totalFrames} frames`,
  );

  // Seed scene counters before rendering so the UI can show 0 / N immediately.
  updateSceneProgress(job.id, 0, storyboard.scenes.length);

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
  console.log(
    `[Worker] Job ${job.id} [4/4] rendering ${storyboard.scenes.length} scenes ` +
      `(${storyboard.totalFrames} frames)`,
  );
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
    ({ completed, total }) => {
      updateSceneProgress(job.id, completed, total);
    },
  );

  // 7. Quality control on the actual MP4 before the job may be called complete.
  updateJob(job.id, 'processing', 88, 'validating');
  const dimensions = ASPECT_RATIOS[videoConfig.aspectRatio];
  const report = await qualityService.inspect({
    jobId: job.id,
    videoPath: result.videoPath,
    expectedDurationSec: result.durationSec,
    expectedWidth: dimensions.width,
    expectedHeight: dimensions.height,
    expectedFps: videoConfig.fps,
    expectAudio: true,
  });

  console.log(
    `[Worker] Job ${job.id} quality: ${report.passed ? 'passed' : 'FAILED'} ` +
      `(${report.durationSec?.toFixed(1) ?? '?'}s, ${report.width ?? '?'}x${report.height ?? '?'}, ` +
      `${report.blackDurationSec.toFixed(1)}s black, ${report.frozenSegments} frozen) -> ${report.reportPath}`,
  );
  for (const warning of report.warnings) {
    console.warn(`[Worker] Job ${job.id} quality warning: ${warning}`);
  }

  if (!report.passed) {
    // A deterministic re-render would fail the same way, so this is terminal.
    updateJob(
      job.id,
      'failed',
      0,
      'quality_failed',
      `Quality checks failed: ${report.failures.join(' | ')} (report: ${report.reportPath})`,
    );
    console.error(`[Worker] Job ${job.id} rejected by quality checks: ${report.failures.join(' | ')}`);
    return;
  }

  updateJob(job.id, 'processing', 96, 'saving');

  // 8. Save video record to DB
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
