import { getDb } from '../db/db.js';
import { ttsService } from '../services/tts.service.js';
import { subtitleService } from '../services/subtitle.service.js';
import { storyboardService } from '../services/storyboard.service.js';
import { attachSceneArtwork } from '../services/storyboard.visuals.js';
import { renderService } from '../services/render.service.js';
import { qualityService } from '../services/quality.service.js';
import { assetDiscovery, buildSceneAssetQueries } from '../services/asset.discovery.js';
import { contentAnalysisService } from '../services/content.analysis.js';
import { validateVideo } from '../services/content.validation.js';
import { resetAssetCache } from '../services/asset.library.js';
import { userAssetService } from '../services/user.asset.service.js';
import { ensureJobDir, jobFiles } from '../services/job.files.js';
import { config } from '../config.js';
import { logError, logInfo, logStep, logSuccess, logWarn } from '../logger.js';
import fs from 'fs';
import {
  ASPECT_RATIOS,
  VOICES,
  defaultVoiceFor,
  languageName,
  normalizeLanguage,
  resolveTtsVoice,
} from '@edumotion/shared';
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
  logStep('Worker', `Job ${job.id} picked up`, '🚀');

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
  logStep('Worker', `Job ${job.id} [1/8] audio synthesis (${script.length} chars)`, '🎙️');
  // The per-video voice wins over the server default, and preset ids from the
  // UI ('en-US-male-1') are translated into the engine's own voice name. A voice
  // from another language is replaced: an English speaker reading Marathi
  // produces unusable audio, and jobs created through the API may not send one.
  const requestedVoice = videoConfig.voice && VOICES[videoConfig.voice]?.lang === normalizeLanguage(videoConfig.language)
    ? videoConfig.voice
    : defaultVoiceFor(videoConfig.language);
  const ttsVoice = resolveTtsVoice(requestedVoice);
  logInfo(
    'Worker',
    `Job ${job.id} voice: ${requestedVoice} (${languageName(videoConfig.language)}) -> ${ttsVoice.voice}`,
  );
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
  logSuccess('Worker', `Job ${job.id} audio ready (${(durationMs / 1000).toFixed(1)}s)`);
  logStep('Worker', `Job ${job.id} [2/8] subtitle alignment`, '📝');

  updateJob(job.id, 'processing', 20, 'aligning_subtitles');

  // 3. Generate subtitles
  // edge-tts reports real word boundaries; only estimate from the audio length
  // when the engine cannot provide them (e.g. espeak).
  const subtitleSource: 'measured' | 'estimated' =
    measuredSubtitles && measuredSubtitles.length > 0 ? 'measured' : 'estimated';
  const subtitleCues = measuredSubtitles && measuredSubtitles.length > 0
    // edge-tts reports one cue per word; group them into readable phrases while
    // keeping the per-word timings for caption highlighting.
    ? subtitleService.groupWordCues(measuredSubtitles)
    : subtitleService.generateSubtitles(script, durationMs);
  // Split sentence-level or very long cues into readable phrases before they
  // are clipped to scenes. Without this a 19-word Marathi sentence stays on
  // screen for 12 seconds, and a scene boundary can reduce it to one word.
  const readableCues = subtitleService.splitLongCues(subtitleCues);
  // Some engines emit phrase cues whose timestamps overlap by a few frames.
  // Resolve that before writing SRT or injecting scene captions.
  const subtitles = subtitleService.normalizeCueTimeline(readableCues);
  logSuccess(
    'Subtitles',
    `Job ${job.id}: ${subtitles.length} cue(s) from ${subtitleSource} timings`,
  );
  const srtPath = jobFiles.subtitlesSrt(job.id);
  const jsonSubPath = jobFiles.subtitlesJson(job.id);
  subtitleService.writeSrt(subtitles, srtPath);
  subtitleService.writeJson(subtitles, jsonSubPath);

  // 3b. Understand the approved narration. This is the single source of truth
  // for the storyboard, so a topic guess from the project title cannot leak a
  // wrong domain into the visuals. Research is best-effort and never blocks.
  updateJob(job.id, 'processing', 22, 'analyzing_content');
  logStep('Worker', `Job ${job.id} [3/8] content analysis`, '🧠');
  const contentAnalysis = await contentAnalysisService.analyze({
    script,
    jobId: job.id,
    research: true,
  });
  logSuccess(
    'Content',
    `Job ${job.id}: ${contentAnalysis.domain}, ${contentAnalysis.keyTerms.length} key term(s), ` +
      `${contentAnalysis.claims.filter((claim) => claim.status === 'supported').length}/` +
      `${contentAnalysis.claims.length} claim(s) supported`,
  );

  updateJob(job.id, 'processing', 30, 'planning_storyboard');

  // 4. Plan storyboard
  logStep('Worker', `Job ${job.id} [4/8] storyboard planning (LLM)`, '🗂️');
  const planned = await storyboardService.planStoryboard(
    job.id,
    script,
    videoConfig,
    durationMs,
    subtitles,
    contentAnalysis,
  );
  logSuccess(
    'Storyboard',
    `Job ${job.id}: planned ${planned.storyboard.scenes.length} scene(s) / ${planned.storyboard.totalFrames} frame(s)`,
  );

  // 4b. Optional images uploaded by the user on Review Script. Analyze them
  // once, then let the scene matcher attach only the ones whose caption or
  // keywords explain that specific scene. The data URLs are inlined for the
  // renderer, so no network or source path is needed at render time.
  updateJob(job.id, 'processing', 33, 'analyzing_user_assets');
  const userAssets = await userAssetService.loadForJob(job.script_id);
  if (userAssets.length > 0) {
    logInfo(
      'Assets',
      `Job ${job.id}: ${userAssets.length} user image(s), ` +
        `${userAssets.filter((asset) => asset.keywords.length > 0).length} with metadata`,
    );
  }

  // 4c. The storyboard now names what each scene needs. Discover artwork from
  // those scene-specific queries, then re-attach only verified matches. This is
  // deliberately after planning: a whole-script keyword list used to download
  // generic icons that had nothing to do with the scene.
  updateJob(job.id, 'processing', 34, 'discovering_scene_assets');
  const sceneQueries = planned.storyboard.scenes.flatMap((scene) =>
    buildSceneAssetQueries(scene, 2),
  );
  logStep('Worker', `Job ${job.id} [5/8] scene artwork discovery (${sceneQueries.length} queries)`, '🖼️');
  logInfo(
    'Assets',
    `Job ${job.id} queries: ${sceneQueries.map((query) => `"${query}"`).join(', ')}`,
  );
  const sceneDiscovery = await assetDiscovery.ensureAssetsForQueries(
    sceneQueries,
    Math.min(18, Math.max(6, planned.storyboard.scenes.length * 2)),
  );
  if (sceneDiscovery.errors.length > 0) {
    logWarn('Assets', `Job ${job.id}: discovery had ${sceneDiscovery.errors.length} error(s)`);
  }
  resetAssetCache();
  const attached = await attachSceneArtwork(planned.storyboard, contentAnalysis, userAssets);
  const storyboard = attached.storyboard;
  const assetUses = attached.assetUses;
  logSuccess('Assets', `Job ${job.id}: ${assetUses.length} visual(s) attached`);

  const usedUserAssetIds = new Set(
    assetUses
      .filter((use) => use.source === 'user' && use.asset)
      .map((use) => use.asset!.replace(/^user\//, '')),
  );
  try {
    fs.writeFileSync(
      jobFiles.userAssets(job.id),
      JSON.stringify(
        {
          uploaded: userAssets.map((asset) => ({
            id: asset.id,
            fileName: asset.fileName,
            caption: asset.caption,
            keywords: asset.keywords,
            used: usedUserAssetIds.has(asset.id),
          })),
          unused: userAssets
            .filter((asset) => !usedUserAssetIds.has(asset.id))
            .map((asset) => asset.id),
        },
        null,
        2,
      ),
      'utf-8',
    );
  } catch (err) {
    logWarn(
      'Assets',
      `Job ${job.id}: could not write the user asset manifest: ` +
        (err instanceof Error ? err.message : String(err)),
    );
  }

  // Persist the scene/asset audit for the render page and later verification.
  const selectedAssetIds = new Set(
    assetUses.map((use) => use.asset).filter((asset): asset is string => Boolean(asset)),
  );
  const downloadedManifest = assetDiscovery.getManifest().filter(
    (entry) =>
      selectedAssetIds.has(entry.relativePath) || sceneDiscovery.queries.includes(entry.query),
  );
  try {
    fs.mkdirSync(jobFiles.dir(job.id), { recursive: true });
    fs.writeFileSync(
      jobFiles.assetsManifest(job.id),
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          queries: sceneDiscovery.queries,
          downloaded: downloadedManifest,
          selections: assetUses,
        },
        null,
        2,
      ),
      'utf-8',
    );
  } catch (err) {
    logWarn(
      'Assets',
      `Job ${job.id}: could not write the asset manifest: ` +
        (err instanceof Error ? err.message : String(err)),
    );
  }

  // 4c. Semantic and structural validation before any expensive render work.
  updateJob(job.id, 'processing', 37, 'validating_storyboard');
  logStep('Worker', `Job ${job.id} [6/8] validating storyboard`, '🧪');
  const validation = validateVideo({
    storyboard,
    script,
    analysis: contentAnalysis,
    config: videoConfig,
    audioDurationMs: durationMs,
  });
  try {
    fs.mkdirSync(jobFiles.dir(job.id), { recursive: true });
    fs.writeFileSync(
      jobFiles.validationReport(job.id),
      JSON.stringify(validation, null, 2),
      'utf-8',
    );
    fs.writeFileSync(
      jobFiles.subtitleReport(job.id),
      JSON.stringify(
        {
          source: subtitleSource,
          totalCues: subtitles.length,
          scenes: storyboard.scenes.map((scene) => ({
            sceneId: scene.id,
            cues: (scene.children ?? [])
              .filter((child) => child.component === 'Subtitle')
              .flatMap((child) => (Array.isArray(child.props['entries']) ? child.props['entries'] : [])),
          })),
        },
        null,
        2,
      ),
      'utf-8',
    );
  } catch (err) {
    logWarn(
      'Validation',
      `Job ${job.id}: could not write validation reports: ` +
        (err instanceof Error ? err.message : String(err)),
    );
  }

  for (const warning of validation.warnings.slice(0, 8)) {
    logWarn('Validation', `${warning.sceneId ?? 'job'}: ${warning.message}`);
  }
  if (!validation.passed) {
    const first = validation.blocking.slice(0, 3).map((issue) => issue.message).join(' | ');
    updateJob(
      job.id,
      'failed',
      0,
      'validation_failed',
      `Semantic validation failed: ${first} (report: ${jobFiles.validationReport(job.id)})`,
    );
    logError('Validation', `Job ${job.id} blocked: ${first}`);
    return;
  }
  logSuccess(
    'Validation',
    `Job ${job.id} passed with ${validation.warnings.length} warning(s)`,
  );

  // Persist scenes to DB — replace any scenes left by a previous attempt so a
  // shorter retry storyboard cannot leave stale scenes behind.
  logStep('Worker', `Job ${job.id}: persisting ${storyboard.scenes.length} scene(s)`, '💾');
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
  logInfo(
    'Assets',
    `Job ${job.id} artwork: ${assetUses.filter((use) => use.source === 'downloaded').length} downloaded, ` +
      `${assetUses.filter((use) => use.source === 'library').length} local, ` +
      `${assetUses.filter((use) => use.source === 'builtin').length} built-in glyph(s)`,
  );
  logSuccess(
    'Worker',
    `Job ${job.id} storyboard ready: ${storyboard.scenes.length} scenes, ${storyboard.totalFrames} frames`,
  );

  // Seed scene counters before rendering so the UI can show 0 / N immediately.
  updateSceneProgress(job.id, 0, storyboard.scenes.length);

  updateJob(job.id, 'processing', 40, 'rendering');

  // 5. Check for cancellation before heavy render
  const jobStatus = db
    .prepare('SELECT status FROM jobs WHERE id = ?')
    .get(job.id) as { status: string } | undefined;
  if (jobStatus?.status === 'cancelled') {
    logWarn('Worker', `Job ${job.id} cancelled before render`);
    return;
  }

  // 6. Render video
  logStep(
    'Worker',
    `Job ${job.id} [7/8] rendering ${storyboard.scenes.length} scenes (${storyboard.totalFrames} frames)`,
    '🎥',
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

  logSuccess(
    'Render',
    `Job ${job.id}: MP4 ready ${result.videoPath} ` +
      `(${(result.sizeBytes / 1024 / 1024).toFixed(1)} MB, ${result.durationSec.toFixed(1)}s)`,
  );

  // 7. Quality control on the actual MP4 before the job may be called complete.
  updateJob(job.id, 'processing', 88, 'validating');
  logStep('Worker', `Job ${job.id} [8/8] quality inspection`, '📊');
  const dimensions = ASPECT_RATIOS[videoConfig.aspectRatio];
  const report = await qualityService.inspect({
    jobId: job.id,
    videoPath: result.videoPath,
    sceneTimesSec: storyboard.scenes.map(
      (scene) => ((scene.startFrame + scene.endFrame) / 2) / videoConfig.fps,
    ),
    storyboard,
    assetUses,
    expectedDurationSec: result.durationSec,
    expectedWidth: dimensions.width,
    expectedHeight: dimensions.height,
    expectedFps: videoConfig.fps,
    expectAudio: true,
  });

  const qualitySummary =
    `Job ${job.id}: ${report.durationSec?.toFixed(1) ?? '?'}s, ` +
    `${report.width ?? '?'}x${report.height ?? '?'}, ` +
    `${report.blackDurationSec.toFixed(1)}s black, ${report.frozenSegments} frozen -> ${report.reportPath}`;
  if (report.passed) logSuccess('Quality', qualitySummary);
  else logError('Quality', qualitySummary);
  for (const warning of report.warnings) {
    logWarn('Quality', `Job ${job.id}: ${warning}`);
  }

  const editorialSummary =
    `Job ${job.id}: ${report.editorial.blocking.length} blocking, ` +
    `${report.editorial.warnings.length} warning(s), ` +
    `${report.editorial.assets.downloaded} downloaded / ${report.editorial.assets.user} user / ` +
    `${report.editorial.assets.builtin} built-in`;
  if (report.editorial.passed) logSuccess('Editorial', editorialSummary);
  else logError('Editorial', editorialSummary);
  for (const warning of report.editorial.warnings.slice(0, 8)) {
    logWarn('Editorial', warning);
  }
  for (const message of report.editorial.blocking.slice(0, 8)) {
    logError('Editorial', message);
  }

  if (!report.passed) {
    // A deterministic re-render would fail the same way, so this is terminal.
    const reasons = report.failures.length > 0
      ? report.failures
      : report.editorial.blocking;
    updateJob(
      job.id,
      'failed',
      0,
      'quality_failed',
      `Quality checks failed: ${reasons.join(' | ')} (report: ${report.reportPath})`,
    );
    logError('Quality', `Job ${job.id} rejected: ${reasons.join(' | ')}`);
    return;
  }

  updateJob(job.id, 'processing', 96, 'saving');
  logStep('Worker', `Job ${job.id}: saving video record`, '💾');

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
  logSuccess('Worker', `Job ${job.id} completed 🎉 — ${result.videoPath}`);
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
    logError('Worker', `Job ${job.id} failed: ${message}`);

    const retryCount = (job.retry_count ?? 0) + 1;
    const maxRetries = config.render.maxRetryCount;

    if (retryCount <= maxRetries) {
      db.prepare(`
        UPDATE jobs
        SET status = 'pending', retry_count = ?, error = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(retryCount, message, job.id);
      logWarn('Worker', `Job ${job.id} re-queued (attempt ${retryCount}/${maxRetries})`);
    } else {
      updateJob(job.id, 'failed', 0, 'failed', message);
      renderService.cleanupTemp(job.id);
      logError('Worker', `Job ${job.id} permanently failed after ${maxRetries} retries`);
    }
  } finally {
    isProcessing = false;
  }
}

export function startRenderWorker(): void {
  logStep('RenderWorker', 'Starting job queue worker (poll interval: 2s)', '🚀');

  // A job left in 'processing' belongs to a previous process that died or was
  // restarted mid-render. Put it back in the queue so it is not stranded.
  const db = getDb();
  const stuck = db.prepare("SELECT id FROM jobs WHERE status = 'processing'").all() as Array<{ id: string }>;
  for (const row of stuck) {
    updateJob(row.id, 'pending', 0, 'requeued');
  }
  if (stuck.length > 0) {
    logWarn('RenderWorker', `Re-queued ${stuck.length} interrupted job(s)`);
  }

  const tick = (): void => {
    runWorkerCycle().catch((err) => {
      logError('Worker', 'Unexpected error in worker cycle', err);
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
  logInfo('RenderWorker', 'Worker stopped');
}
