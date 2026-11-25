import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { StoryboardPlan } from '@edumotion/shared';
import { jobFiles } from './job.files.js';
import { validateLayout } from './layout.validation.js';
import type { SceneAssetUse } from './storyboard.visuals.js';
import { logStep } from '../logger.js';

/**
 * Post-render quality control.
 *
 * A render that "finished" is not a video: it can be black, frozen, silent, the
 * wrong size, or half the length of the narration. This inspects the actual MP4
 * with ffprobe/ffmpeg and refuses to let the job be marked completed when a
 * required check fails.
 */

export interface QualityExpectation {
  expectedDurationSec: number;
  expectedWidth: number;
  expectedHeight: number;
  expectedFps: number;
  expectAudio: boolean;
}

export interface EditorialAssetCounts {
  downloaded: number;
  library: number;
  builtin: number;
  user: number;
}

export interface EditorialReport {
  /** Named checks this run performed, so a passing report is auditable. */
  checks: string[];
  passed: boolean;
  blocking: string[];
  warnings: string[];
  assets: EditorialAssetCounts;
  /** One representative frame per scene, for the manual review. */
  frameReviewPaths: string[];
}

export interface QualityReport {
  jobId: string;
  videoPath: string;
  checkedAt: string;
  passed: boolean;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
  blackSegments: Array<{ startSec: number; endSec: number }>;
  blackDurationSec: number;
  frozenSegments: number;
  frozenDurationSec: number;
  expected: QualityExpectation;
  /** Representative frame extracted from each scene, for the E2E review. */
  sampledFrames: string[];
  failures: string[];
  warnings: string[];
  /** Editorial review, kept separate from the technical media checks. */
  editorial: EditorialReport;
  reportPath: string;
}

interface CommandFailure extends Error {
  stderr?: string;
}

interface ProbeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  duration?: string;
}

interface ProbeResult {
  streams?: ProbeStream[];
  format?: { duration?: string };
}

function run(command: string, args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error) {
          const failure: CommandFailure = Object.assign(new Error(error.message), {
            stderr: typeof stderr === 'string' ? stderr : '',
          });
          reject(failure);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

function parseFps(raw: string | undefined): number | null {
  if (!raw) return null;
  const [numerator, denominator] = raw.split('/');
  const value = Number(numerator) / Number(denominator ?? 1);
  return Number.isFinite(value) && value > 0 ? value : null;
}

class QualityService {
  async inspect(options: {
    jobId: string;
    videoPath: string;
    sceneTimesSec?: number[];
    /** The exact plan rendered; enables editorial checks on the real props. */
    storyboard?: StoryboardPlan;
    assetUses?: SceneAssetUse[];
  } & QualityExpectation): Promise<QualityReport> {
    const failures: string[] = [];
    const warnings: string[] = [];
    const expected: QualityExpectation = {
      expectedDurationSec: options.expectedDurationSec,
      expectedWidth: options.expectedWidth,
      expectedHeight: options.expectedHeight,
      expectedFps: options.expectedFps,
      expectAudio: options.expectAudio,
    };

    logStep('Quality', `Job ${options.jobId}: inspecting ${path.basename(options.videoPath)}`, '📊');

    let probe: ProbeResult = {};
    try {
      const { stdout } = await run(
        'ffprobe',
        [
          '-v', 'quiet',
          '-print_format', 'json',
          '-show_format',
          '-show_streams',
          options.videoPath,
        ],
        30_000,
      );
      probe = JSON.parse(stdout) as ProbeResult;
    } catch (err) {
      failures.push(
        `ffprobe could not read the output file: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const streams = probe.streams ?? [];
    const videoStream = streams.find((stream) => stream.codec_type === 'video');
    const audioStream = streams.find((stream) => stream.codec_type === 'audio');

    const rawDuration = probe.format?.duration ?? videoStream?.duration;
    const durationSec = rawDuration ? Number.parseFloat(rawDuration) : null;
    const width = videoStream?.width ?? null;
    const height = videoStream?.height ?? null;
    const fps = parseFps(videoStream?.avg_frame_rate);

    if (!videoStream) failures.push('Output has no video stream');
    if (expected.expectAudio && !audioStream) failures.push('Output has no audio stream');

    if (width !== null && height !== null
      && (width !== expected.expectedWidth || height !== expected.expectedHeight)) {
      failures.push(
        `Wrong dimensions: ${width}x${height}, expected ${expected.expectedWidth}x${expected.expectedHeight}`,
      );
    }

    if (durationSec === null || !Number.isFinite(durationSec) || durationSec <= 0) {
      failures.push('Output duration could not be read');
    } else {
      const tolerance = Math.max(1.5, expected.expectedDurationSec * 0.08);
      const delta = Math.abs(durationSec - expected.expectedDurationSec);
      if (delta > tolerance) {
        failures.push(
          `Duration ${durationSec.toFixed(2)}s differs from the planned ${expected.expectedDurationSec.toFixed(2)}s by more than ${tolerance.toFixed(2)}s`,
        );
      }
    }

    if (fps !== null && Math.abs(fps - expected.expectedFps) > 0.6) {
      warnings.push(`Frame rate ${fps.toFixed(2)} differs from ${expected.expectedFps}`);
    }

    // Black / frozen frame detection in one decode pass.
    const blackSegments: Array<{ startSec: number; endSec: number }> = [];
    let blackDurationSec = 0;
    let frozenSegments = 0;
    let frozenDurationSec = 0;

    try {
      const analysis = await run(
        'ffmpeg',
        [
          '-hide_banner',
          '-nostats',
          '-i', options.videoPath,
          '-vf', 'blackdetect=d=0.6:pix_th=0.10,freezedetect=n=-60dB:d=1.2',
          '-an',
          '-f', 'null',
          '-',
        ],
        180_000,
      );

      for (const match of analysis.stderr.matchAll(
        /black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)\s+black_duration:\s*([\d.]+)/g,
      )) {
        const startSec = Number(match[1]);
        const endSec = Number(match[2]);
        const detected = Number(match[3]);
        if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) continue;
        blackSegments.push({ startSec, endSec });
        blackDurationSec += Number.isFinite(detected) ? detected : endSec - startSec;
      }

      for (const match of analysis.stderr.matchAll(
        /freeze_start:\s*([\d.]+)[\s\S]*?freeze_duration:\s*([\d.]+)/g,
      )) {
        const detected = Number(match[2]);
        if (!Number.isFinite(detected)) continue;
        frozenSegments++;
        frozenDurationSec += detected;
      }
    } catch (err) {
      // A decode failure is itself a quality failure: the file may not play.
      failures.push(
        `Frame analysis failed: ${(err as CommandFailure).stderr?.trim().slice(-300)
          || (err instanceof Error ? err.message : String(err))}`,
      );
    }

    if (durationSec && durationSec > 0) {
      const blackLimit = Math.max(1.5, durationSec * 0.15);
      if (blackDurationSec > blackLimit) {
        failures.push(
          `${blackDurationSec.toFixed(1)}s of black frames (limit ${blackLimit.toFixed(1)}s)`,
        );
      }
      // Job B passed with 4.73 s frozen out of 14.93 s (32%); a third of a
      // "video" being a still image is a failure, not a warning.
      if (frozenDurationSec > durationSec * 0.3) {
        failures.push(
          `${frozenDurationSec.toFixed(1)}s of frozen picture is more than 30% of the video`,
        );
      } else if (frozenDurationSec > durationSec * 0.12) {
        // A technically playable MP4 can still be a slideshow. Report this even
        // when it is below the hard limit; the old 50% threshold stayed silent
        // on a 15 s video with 4.7 s of frozen picture.
        warnings.push(
          `${frozenDurationSec.toFixed(1)}s of frozen picture (${Math.round(
            (frozenDurationSec / durationSec) * 100,
          )}%) — add motion to the static scenes`,
        );
      }
    }

    // Extract one frame per scene. Without this, a technically valid MP4 can
    // still contain the wrong visual and nobody sees it until manual review.
    const sampledFrames: string[] = [];
    const framesDir = jobFiles.framesDir(options.jobId);
    const sceneTimes = (options.sceneTimesSec ?? []).filter(
      (time) => Number.isFinite(time) && time >= 0 && (durationSec === null || time < durationSec),
    );
    if (sceneTimes.length > 0) {
      try {
        fs.mkdirSync(framesDir, { recursive: true });
        for (const [index, time] of sceneTimes.entries()) {
          const framePath = path.join(
            framesDir,
            `scene-${String(index + 1).padStart(2, '0')}.jpg`,
          );
          try {
            await run(
              'ffmpeg',
              [
                '-hide_banner', '-loglevel', 'error', '-y',
                '-ss', time.toFixed(3), '-i', options.videoPath,
                '-frames:v', '1', '-q:v', '2', framePath,
              ],
              30_000,
            );
            if (fs.existsSync(framePath)) sampledFrames.push(framePath);
          } catch (err) {
            warnings.push(
              `Could not sample scene ${index + 1}: ` +
                (err instanceof Error ? err.message : String(err)),
            );
          }
        }
      } catch (err) {
        warnings.push(
          `Could not create the frame folder: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    // Editorial review: duplicates, overlaps, clustered diagrams, truncation
    // and asset provenance. Technical validity never implies editorial quality.
    const layoutIssues = options.storyboard
      ? validateLayout(options.storyboard, expected.expectedWidth, expected.expectedHeight)
      : [];
    const assets: EditorialAssetCounts = { downloaded: 0, library: 0, builtin: 0, user: 0 };
    for (const use of options.assetUses ?? []) {
      if (use.source === 'downloaded') assets.downloaded++;
      else if (use.source === 'library') assets.library++;
      else if (use.source === 'user') assets.user++;
      else assets.builtin++;
    }
    const editorial: EditorialReport = {
      checks: [
        'duplicate title/bubble/caption text',
        'component bounding-box overlap',
        'diagram item spread and label length',
        'title truncation and dangling connectors',
        'empty full-width panels',
        'unverified artwork without imageAlt',
        'instructor bounds and final-scene exclusion',
        'caption sentence-boundary fragments',
      ],
      passed: !layoutIssues.some((issue) => issue.severity === 'blocking'),
      blocking: layoutIssues
        .filter((issue) => issue.severity === 'blocking')
        .map((issue) => `${issue.sceneId}: ${issue.message}`),
      warnings: layoutIssues
        .filter((issue) => issue.severity === 'warning')
        .map((issue) => `${issue.sceneId}: ${issue.message}`),
      assets,
      frameReviewPaths: [],
    };

    // The report belongs to the job's own folder, next to the video it describes.
    const reportPath = jobFiles.qualityReport(options.jobId);
    const report: QualityReport = {
      jobId: options.jobId,
      videoPath: options.videoPath,
      checkedAt: new Date().toISOString(),
      // A technically valid MP4 with a knowingly broken scene is not a pass.
      passed: failures.length === 0 && editorial.passed,
      durationSec,
      width,
      height,
      fps,
      hasVideo: Boolean(videoStream),
      hasAudio: Boolean(audioStream),
      blackSegments,
      blackDurationSec: Number(blackDurationSec.toFixed(2)),
      frozenSegments,
      frozenDurationSec: Number(frozenDurationSec.toFixed(2)),
      expected,
      sampledFrames,
      failures,
      warnings,
      editorial: { ...editorial, frameReviewPaths: sampledFrames },
      reportPath,
    };

    try {
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    } catch (err) {
      warnings.push(
        `Could not write the quality report: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return report;
  }
}

export const qualityService = new QualityService();
