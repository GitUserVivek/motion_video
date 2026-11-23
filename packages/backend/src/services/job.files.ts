import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

/**
 * One folder per job: `output/<jobId>/` holds everything the job produced —
 * video, thumbnail, narration audio, subtitles, the quality report and the
 * storyboard / raw LLM responses.
 *
 * Artifacts used to be filed by type (`output/videos`, `output/audio`, …), which
 * spread a single video over five folders. With a folder per job, the browser at
 * /output shows one entry per video and the folder can be moved, backed up or
 * deleted as one unit.
 */

/** Job ids are UUIDs; anything that could escape `output/` is rejected. */
const SAFE_JOB_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function safeJobId(jobId: string): string {
  if (!SAFE_JOB_ID.test(jobId) || jobId.includes('..')) {
    throw new Error(
      `Refusing to use an unsafe job id as an output folder: ${JSON.stringify(jobId)}`,
    );
  }
  return jobId;
}

export function jobDir(jobId: string): string {
  return path.join(config.storage.outputDir, safeJobId(jobId));
}

/** Create `output/<jobId>/` (idempotent). */
export function ensureJobDir(jobId: string): string {
  const dir = jobDir(jobId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const jobFiles = {
  dir: jobDir,
  /** Final H.264 MP4. */
  video: (jobId: string) => path.join(jobDir(jobId), 'video.mp4'),
  thumbnail: (jobId: string) => path.join(jobDir(jobId), 'thumbnail.jpg'),
  /** Narration WAV that was muxed into the video. */
  audio: (jobId: string) => path.join(jobDir(jobId), 'audio.wav'),
  subtitlesSrt: (jobId: string) => path.join(jobDir(jobId), 'subtitles.srt'),
  subtitlesJson: (jobId: string) => path.join(jobDir(jobId), 'subtitles.json'),
  qualityReport: (jobId: string) => path.join(jobDir(jobId), 'quality-report.json'),
  /** Final directed storyboard: the component and props of every scene. */
  storyboard: (jobId: string) => path.join(jobDir(jobId), 'storyboard.json'),
  /** Every model response for this job, including the rejected attempts. */
  llmStoryboard: (jobId: string) => path.join(jobDir(jobId), 'llm', 'storyboard.json'),
  /** Structured understanding of the approved narration. */
  contentAnalysis: (jobId: string) => path.join(jobDir(jobId), 'content-analysis.json'),
  /** Research sources used to verify claims, when a provider is enabled. */
  research: (jobId: string) => path.join(jobDir(jobId), 'research.json'),
  /** Scene-level asset candidates, verdicts and selected files. */
  assetsManifest: (jobId: string) => path.join(jobDir(jobId), 'assets.json'),
  /** User-uploaded images and whether each made it into the storyboard. */
  userAssets: (jobId: string) => path.join(jobDir(jobId), 'user-assets.json'),
  /** Relative/absolute child frame audit. */
  timingReport: (jobId: string) => path.join(jobDir(jobId), 'timing-report.json'),
  /** Caption source and boundary-splitting audit. */
  subtitleReport: (jobId: string) => path.join(jobDir(jobId), 'subtitle-report.json'),
  /** Semantic/structural validation results. */
  validationReport: (jobId: string) => path.join(jobDir(jobId), 'validation-report.json'),
  /** Sampled frames used for the final visual review. */
  framesDir: (jobId: string) => path.join(jobDir(jobId), 'frames'),
  /** Detailed render performance metrics (profile, timing, output size). */
  renderMetrics: (jobId: string) => path.join(jobDir(jobId), 'render-metrics.json'),
} as const;
