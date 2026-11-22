import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { jobFiles } from './job.files.js';

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
  failures: string[];
  warnings: string[];
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
      if (frozenDurationSec > durationSec * 0.5) {
        warnings.push(
          `${frozenDurationSec.toFixed(1)}s of frozen picture — consider adding motion`,
        );
      }
    }

    // The report belongs to the job's own folder, next to the video it describes.
    const reportPath = jobFiles.qualityReport(options.jobId);
    const report: QualityReport = {
      jobId: options.jobId,
      videoPath: options.videoPath,
      checkedAt: new Date().toISOString(),
      passed: failures.length === 0,
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
      failures,
      warnings,
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
