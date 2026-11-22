import { exec, spawn } from 'child_process';
import { createRequire } from 'module';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { jobFiles } from './job.files.js';
import { recommendSettings } from './hardware.service.js';
import type { StoryboardPlan, VideoConfig, SceneInstruction } from '@edumotion/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);

export interface RenderResult {
  videoPath: string;
  thumbnailPath: string | null;
  durationSec: number;
  sizeBytes: number;
}

/** How many scenes the frame renderer has finished, in storyboard order. */
export interface SceneRenderProgress {
  completed: number;
  total: number;
  sceneId: string;
  label: string;
}

class RenderService {
  /**
   * Render the Remotion composition to a PNG sequence, then mux with FFmpeg.
   * Returns the final MP4 path.
   */
  async renderVideo(
    jobId: string,
    storyboard: StoryboardPlan,
    audioPath: string,
    videoConfig: VideoConfig,
    onProgress?: (pct: number) => void,
    onSceneProgress?: (progress: SceneRenderProgress) => void,
  ): Promise<RenderResult> {
    const framesDir = path.join(config.storage.tempDir, jobId, 'frames');
    // Final artifacts live in output/<jobId>/ together with the audio, the
    // subtitles and the storyboard this video was rendered from.
    const finalPath = jobFiles.video(jobId);
    const thumbPath = jobFiles.thumbnail(jobId);

    fs.mkdirSync(framesDir, { recursive: true });

    const renderSettings = recommendSettings();
    const renderStartedAt = Date.now();

    try {
      onProgress?.(5);

      // Remotion `--props` expects the composition props, i.e. { storyboard }
      const propsPath = path.join(config.storage.tempDir, jobId, 'props.json');
      fs.writeFileSync(propsPath, JSON.stringify({ storyboard }), 'utf-8');

      onProgress?.(10);

      console.log(
        `[Render] Job ${jobId}: ${storyboard.scenes.length} scenes, ` +
          `${storyboard.totalFrames} frames @ ${videoConfig.fps}fps, ` +
          `profile=${renderSettings.profile}, concurrency=${renderSettings.concurrency}, ` +
          `gl=${renderSettings.gl ?? 'chrome-default'}, nvenc=${renderSettings.useNvenc}`,
      );

      // Render the image sequence via the Remotion CLI
      const renderFramesStartedAt = Date.now();
      await this.renderFrames(
        jobId,
        propsPath,
        framesDir,
        storyboard.totalFrames,
        storyboard.scenes,
        videoConfig,
        onProgress,
        onSceneProgress,
        renderSettings,
      );
      const renderFramesMs = Date.now() - renderFramesStartedAt;

      onProgress?.(75);

      // Mux frames + audio to MP4
      const muxStartedAt = Date.now();
      await this.muxVideo(
        framesDir,
        audioPath,
        finalPath,
        videoConfig.fps,
        storyboard.totalFrames,
        renderSettings.useNvenc,
      );
      const muxMs = Date.now() - muxStartedAt;

      onProgress?.(90);

      // Extract thumbnail at 1 second
      await this.extractThumbnail(finalPath, thumbPath);

      onProgress?.(95);

      // Validate output
      await this.validateOutput(finalPath);

      const stat = fs.statSync(finalPath);
      const durationSec = storyboard.totalFrames / videoConfig.fps;

      // Persist detailed performance metrics for A/B comparison.
      try {
        const metrics = {
          jobId,
          profile: renderSettings.profile,
          gl: renderSettings.gl,
          concurrency: renderSettings.concurrency,
          useNvenc: renderSettings.useNvenc,
          chunkCount: renderSettings.chunkCount,
          totalFrames: storyboard.totalFrames,
          fps: videoConfig.fps,
          renderFramesMs,
          muxMs,
          totalMs: Date.now() - renderStartedAt,
          outputBytes: stat.size,
          finishedAt: new Date().toISOString(),
        };
        fs.writeFileSync(jobFiles.renderMetrics(jobId), JSON.stringify(metrics, null, 2), 'utf-8');
      } catch { /* metrics are best-effort */ }

      onProgress?.(100);

      return {
        videoPath: finalPath,
        thumbnailPath: fs.existsSync(thumbPath) ? thumbPath : null,
        durationSec,
        sizeBytes: stat.size,
      };
    } finally {
      // Always clean up temp frames
      this.cleanupTemp(jobId);
    }
  }

  private async renderFrames(
    jobId: string,
    propsPath: string,
    framesDir: string,
    totalFrames: number,
    scenes: SceneInstruction[],
    videoConfig: VideoConfig,
    onProgress?: (pct: number) => void,
    onSceneProgress?: (progress: SceneRenderProgress) => void,
    settings?: ReturnType<typeof recommendSettings>,
  ): Promise<void> {
    // Optional frame-range parallel render across multiple GPUs. Falls back to
    // the single pass below if anything goes wrong so a render never fails just
    // because the experimental chunked path did.
    if ((settings?.chunkCount ?? 1) > 1 && (settings?.gpuIndices.length ?? 0) > 1) {
      try {
        await this.renderFramesChunked(
          jobId, propsPath, framesDir, totalFrames, scenes, videoConfig, onProgress, onSceneProgress, settings!,
        );
        return;
      } catch (err) {
        console.warn(
          `[Render] Job ${jobId}: chunked render failed, falling back to single pass: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    const rendererRoot = path.resolve(__dirname, '../../../renderer');
    const entryPoint = path.join(rendererRoot, 'src', 'root.tsx');

    // Storyboard order, so "scene 3/8" always matches the order in the video.
    const ordered = [...scenes].sort((a, b) => a.startFrame - b.startFrame);
    const totalScenes = ordered.length;
    let framesDone = 0;
    let scenesDone = 0;

    return new Promise((resolve, reject) => {
      const args = [
        'render',
        entryPoint,
        'EduVideo',
        '--output', framesDir,
        // Without --sequence Remotion writes a video file and the frame muxing
        // below finds nothing to encode.
        '--sequence',
        '--image-format', 'jpeg',
        // Higher quality source frames; the encoder below keeps the file small.
        '--jpeg-quality', '92',
        // Hardware-aware concurrency: keep one core free and avoid oversubscribing Chrome.
        '--concurrency', String(settings?.concurrency ?? config.render.concurrency),
        // GPU backend chosen by hardware detection (angle-egl on NVIDIA).
        ...(settings?.gl ? ['--gl', settings.gl] : (config.render.gl ? ['--gl', config.render.gl] : [])),
        '--props', propsPath,
        '--log', 'verbose',
      ];

      // Run the CLI with the current node binary instead of `npx remotion`:
      // npx only works when the executable happens to be on npm's resolution
      // path, and fails with "could not determine executable to run" otherwise.
      const cli = this.resolveRemotionCli(rendererRoot);
      const child = spawn(cli.command, [...cli.args, ...args], {
        cwd: rendererRoot,
        env: process.env,
      });

      let output = '';

      /**
       * Advance every counter to `frames` (monotonic) and log each scene the
       * moment its last frame is rendered. Progress comes from two sources
       * because Remotion's log format changes between releases and a non-TTY
       * run can split lines mid-number.
       */
      const report = (frames: number): void => {
        if (frames <= framesDone) return;
        framesDone = frames;
        onProgress?.(10 + Math.round((framesDone / totalFrames) * 65));

        while (scenesDone < totalScenes) {
          const scene = ordered[scenesDone];
          if (!scene) break;
          // endFrame is exclusive in EduVideo: the scene is done once the frame
          // before it has been rendered.
          if (framesDone < scene.endFrame - 1) break;

          scenesDone++;
          const label = this.sceneLabel(scene);
          console.log(
            `[Render] Job ${jobId}: scene ${scenesDone}/${totalScenes} rendered — ${label} ` +
              `(${framesDone}/${totalFrames} frames)`,
          );
          onSceneProgress?.({ completed: scenesDone, total: totalScenes, sceneId: scene.id, label });
        }
      };

      const onData = (data: Buffer): void => {
        output += data.toString();
        report(this.parseRenderedFrames(output));
      };
      child.stderr.on('data', onData);
      child.stdout.on('data', onData);

      // Frames-on-disk fallback: keeps scene progress moving when the CLI's
      // progress lines cannot be parsed at all.
      const timer = setInterval(() => {
        report(Math.max(this.parseRenderedFrames(output), this.countFramesOnDisk(framesDir)));
      }, 2000);
      if (typeof timer.unref === 'function') timer.unref();

      child.on('error', (err) => {
        clearInterval(timer);
        reject(new Error(`Could not start Remotion render: ${err.message}`));
      });

      child.on('close', (code) => {
        clearInterval(timer);
        if (code !== 0) {
          // Keep the whole output on disk and surface the first real error line:
          // slicing the tail of a stack trace hides the actual message.
          const logPath = path.join(config.storage.tempDir, `${jobId}.remotion.log`);
          try {
            fs.mkdirSync(path.dirname(logPath), { recursive: true });
            fs.writeFileSync(logPath, `$ ${cli.command} ${[...cli.args, ...args].join(' ')}\n\n${output}`, 'utf-8');
          } catch { /* log is best-effort */ }

          reject(
            new Error(
              `Remotion render failed (exit ${code}): ${this.summarizeRenderError(output)}\n` +
                `Full log: ${logPath}`,
            ),
          );
          return;
        }
        try {
          this.normalizeFrameSequence(framesDir, totalFrames);
          // The CLI can finish below the last reported frame; close out any
          // scenes that never got a progress line so the UI shows N/N.
          report(totalFrames);
          if (scenesDone === totalScenes) {
            console.log(`[Render] Job ${jobId}: all ${totalScenes} scenes rendered`);
          }
          resolve();
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });
  }

  /**
   * Render the composition in contiguous frame ranges, one per GPU, then merge
   * the resulting frame sequences into `framesDir` with continuous numbering.
   * Experimental: only invoked when a multi-GPU profile is explicitly selected.
   */
  private async renderFramesChunked(
    jobId: string,
    propsPath: string,
    framesDir: string,
    totalFrames: number,
    scenes: SceneInstruction[],
    videoConfig: VideoConfig,
    onProgress?: (pct: number) => void,
    onSceneProgress?: (progress: SceneRenderProgress) => void,
    settings?: ReturnType<typeof recommendSettings>,
  ): Promise<void> {
    const rendererRoot = path.resolve(__dirname, '../../../renderer');
    const entryPoint = path.join(rendererRoot, 'src', 'root.tsx');
    const cli = this.resolveRemotionCli(rendererRoot);
    const chunkCount = settings?.chunkCount ?? 2;
    const gpuIndices = settings?.gpuIndices ?? [0, 1];

    // Contiguous frame ranges, e.g. [0,265) and [265,530).
    const ranges: Array<[number, number]> = [];
    const base = Math.floor(totalFrames / chunkCount);
    let cursor = 0;
    for (let i = 0; i < chunkCount; i++) {
      const end = i === chunkCount - 1 ? totalFrames : cursor + base;
      ranges.push([cursor, end]);
      cursor = end;
    }

    const chunkDirs = ranges.map((_, i) => path.join(config.storage.tempDir, jobId, `frames-chunk-${i}`));
    for (const dir of chunkDirs) fs.mkdirSync(dir, { recursive: true });

    const runChunk = (index: number): Promise<void> => {
      const [start, end] = ranges[index]!;
      const dir = chunkDirs[index]!;
      const gpu = gpuIndices[index % gpuIndices.length]!;
      const args = [
        'render',
        entryPoint,
        'EduVideo',
        '--output', dir,
        '--sequence',
        '--image-format', 'jpeg',
        '--jpeg-quality', '92',
        '--concurrency', String(Math.max(1, Math.floor((settings?.concurrency ?? 2) / chunkCount))),
        ...(settings?.gl ? ['--gl', settings.gl] : []),
        '--props', propsPath,
        '--frames', `${start}-${end - 1}`,
        '--log', 'error',
      ];

      const env = { ...process.env, CUDA_VISIBLE_DEVICES: String(gpu) };

      return new Promise((resolve, reject) => {
        const child = spawn(cli.command, [...cli.args, ...args], { cwd: rendererRoot, env });
        let output = '';
        const onData = (data: Buffer): void => { output += data.toString(); };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.on('error', (err) => reject(new Error(`Could not start Remotion chunk ${index}: ${err.message}`)));
        child.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`Remotion chunk ${index} failed (exit ${code}): ${output.slice(-500)}`));
            return;
          }
          resolve();
        });
      });
    };

    await Promise.all(ranges.map((_, i) => runChunk(i)));

    // Merge chunks into the main framesDir with continuous numbering.
    fs.mkdirSync(framesDir, { recursive: true });
    let globalIndex = 0;
    for (let i = 0; i < chunkCount; i++) {
      const [start, end] = ranges[i]!;
      const chunkDir = chunkDirs[i]!;
      const entries = fs
        .readdirSync(chunkDir)
        .filter((name) => /\.(jpe?g|png)$/i.test(name))
        .map((name) => ({ name, frame: Number(/(\d+)(?=\.[^.]+$)/.exec(name)?.[1] ?? NaN) }))
        .filter((entry) => Number.isFinite(entry.frame))
        .sort((a, b) => a.frame - b.frame);

      for (const entry of entries) {
        const target = `frame${String(globalIndex).padStart(6, '0')}.jpeg`;
        fs.renameSync(path.join(chunkDir, entry.name), path.join(framesDir, target));
        globalIndex++;
      }
    }

    this.normalizeFrameSequence(framesDir, totalFrames);
    onProgress?.(75);
  }

  /**
   * Highest rendered frame found in Remotion's output (`Rendered 120/530`,
   * `Rendering frame 120/530`, …). Only the tail is scanned: the accumulated
   * log grows, the interesting progress is always at the end.
   */
  private parseRenderedFrames(output: string): number {
    const tail = output.slice(-8000);
    let max = 0;
    const pattern = /Rend(?:ering|ered)[^\n]{0,40}?(\d+)\s*(?:\/|of)\s*\d+/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(tail)) !== null) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > max) max = value;
    }
    return max;
  }

  /** Number of frame images Remotion has written so far. */
  private countFramesOnDisk(framesDir: string): number {
    try {
      return fs.readdirSync(framesDir).filter((name) => /\.(jpe?g|png)$/i.test(name)).length;
    } catch {
      return 0;
    }
  }

  /** Human-readable scene name for the log: its title, first text, or its id. */
  private sceneLabel(scene: SceneInstruction): string {
    const title = scene.props['title'];
    if (typeof title === 'string' && title.trim()) return `"${title.trim().slice(0, 60)}"`;

    for (const child of scene.children ?? []) {
      const text = child.props['text'];
      if (typeof text === 'string' && text.trim()) return `"${text.trim().slice(0, 60)}"`;
    }

    return scene.id;
  }

  /**
   * Pull the meaningful failure out of Remotion's output. The CLI prints
   * webpack/browser errors first and the stack trace last, so the tail of the
   * output is the least useful part.
   */
  private summarizeRenderError(output: string): string {
    // Strip ANSI colour codes first: Remotion wraps the useful message in them,
    // which breaks line-prefix matching.
    const lines = output
      .replace(/\x1b\[[0-9;]*m/g, '')
      .replace(/\r/g, '')
      .split('\n');

    // "TypeError:" / "Minified React error #185" carry no space before `Error:`,
    // so the previous pattern skipped them and reported a bare stack trace.
    const start = lines.findIndex((line) =>
      /(Minified React error|Module not found|\bTypeError\b|\bRangeError\b|\bReferenceError\b|\bSyntaxError\b|\bUncaught\b|is not a function|Cannot read propert|\bError:)/.test(
        line,
      ),
    );
    const from = start === -1 ? Math.max(0, lines.length - 20) : start;
    return lines.slice(from, from + 18).join('\n').trim().slice(0, 1600);
  }

  /**
   * Locate the Remotion CLI entry script. The `remotion` package is only the
   * runtime library; the executable lives in `@remotion/cli`.
   */
  private resolveRemotionCli(rendererRoot: string): { command: string; args: string[] } {
    const candidates = [
      path.join(rendererRoot, 'node_modules', '@remotion', 'cli', 'package.json'),
      path.join(process.cwd(), 'node_modules', '@remotion', 'cli', 'package.json'),
    ];

    const pkgPath = candidates.find((candidate) => fs.existsSync(candidate));
    if (pkgPath) return this.remotionCliEntry(pkgPath);

    try {
      const requireFromRenderer = createRequire(path.join(rendererRoot, 'package.json'));
      return this.remotionCliEntry(requireFromRenderer.resolve('@remotion/cli/package.json'));
    } catch { /* not resolvable from the renderer workspace */ }

    throw new Error(
      'Remotion CLI is not installed (@remotion/cli is missing from packages/renderer). ' +
        'Run `npm install` in the project root so the renderer workspace installs it.',
    );
  }

  private remotionCliEntry(pkgPath: string): { command: string; args: string[] } {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
      bin?: string | Record<string, string>;
    };
    const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.['remotion'];
    if (!bin) {
      throw new Error(`@remotion/cli at ${pkgPath} does not expose a remotion executable`);
    }

    // Absolute node + absolute script: no PATH, no npx, no network at render time.
    return { command: process.execPath, args: [path.resolve(path.dirname(pkgPath), bin)] };
  }

  /**
   * Remotion names sequence files `element-0000.jpeg`, while FFmpeg muxes a
   * printf pattern. Rename the rendered frames to `frame%06d.jpeg` in frame
   * order, so encoding never depends on Remotion's naming scheme.
   */
  private normalizeFrameSequence(framesDir: string, expectedFrames: number): void {
    if (!fs.existsSync(framesDir)) {
      throw new Error(`Remotion did not create the frames directory: ${framesDir}`);
    }

    const entries = fs
      .readdirSync(framesDir)
      .filter((name) => /\.(jpe?g|png)$/i.test(name))
      .map((name) => ({ name, frame: Number(/(\d+)(?=\.[^.]+$)/.exec(name)?.[1] ?? NaN) }))
      .filter((entry) => Number.isFinite(entry.frame))
      .sort((a, b) => a.frame - b.frame);

    if (entries.length === 0) {
      throw new Error('Remotion render completed but produced no frames');
    }

    entries.forEach((entry, index) => {
      const target = `frame${String(index).padStart(6, '0')}.jpeg`;
      if (entry.name !== target) {
        fs.renameSync(path.join(framesDir, entry.name), path.join(framesDir, target));
      }
    });

    if (entries.length < expectedFrames) {
      throw new Error(
        `Remotion rendered ${entries.length} frames, expected ${expectedFrames}`,
      );
    }
  }

  async muxVideo(
    framesDir: string,
    audioPath: string,
    outputPath: string,
    fps: number,
    _totalFrames: number,
    useNvenc: boolean = false,
  ): Promise<void> {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const hasAudio = fs.existsSync(audioPath);
    const audioArgs = hasAudio
      ? [`-i`, audioPath, `-c:a`, `aac`, `-b:a`, `128k`]
      : [];

    const run = async (nvenc: boolean): Promise<void> => {
      const videoArgs = nvenc
        ? ['-c:v', 'h264_nvenc', '-preset', 'p4', '-tune', 'hq', '-rc', 'vbr', '-cq', '20', '-b:v', '0']
        : ['-c:v', 'libx264', '-crf', '20', '-preset', 'fast'];

      const cmd = [
        'ffmpeg', '-y',
        '-framerate', String(fps),
        '-i', path.join(framesDir, 'frame%06d.jpeg'),
        ...audioArgs,
        ...videoArgs,
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        outputPath,
      ].join(' ');

      const { stderr } = await execAsync(cmd, { timeout: 300000 });
      if (!fs.existsSync(outputPath)) {
        throw new Error(`FFmpeg mux failed. stderr: ${stderr.slice(-500)}`);
      }
    };

    if (useNvenc) {
      try {
        await run(true);
        return;
      } catch (err) {
        console.warn(`[Render] NVENC mux failed, falling back to libx264: ${err instanceof Error ? err.message : err}`);
        // Clean up partial output before retrying.
        try { fs.rmSync(outputPath, { force: true }); } catch { /* ignore */ }
      }
    }
    await run(false);
  }

  private async extractThumbnail(
    videoPath: string,
    thumbPath: string,
  ): Promise<void> {
    try {
      fs.mkdirSync(path.dirname(thumbPath), { recursive: true });
      await execAsync(
        `ffmpeg -y -ss 1 -i "${videoPath}" -vframes 1 -q:v 3 "${thumbPath}"`,
        { timeout: 30000 },
      );
    } catch {
      // Thumbnail is non-critical
    }
  }

  async validateOutput(videoPath: string): Promise<void> {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Output video file not found: ${videoPath}`);
    }
    const stat = fs.statSync(videoPath);
    if (stat.size < 1024) {
      throw new Error(`Output video is too small (${stat.size} bytes) — likely corrupt`);
    }
    // ffprobe check
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_streams "${videoPath}"`,
      { timeout: 30000 },
    );
    const data = JSON.parse(stdout) as { streams: Array<{ codec_type: string }> };
    const hasVideo = data.streams.some((s) => s.codec_type === 'video');
    if (!hasVideo) {
      throw new Error('Output file has no video stream — render may have failed');
    }
  }

  cleanupTemp(jobId: string): void {
    const tempJobDir = path.join(config.storage.tempDir, jobId);
    if (fs.existsSync(tempJobDir)) {
      fs.rmSync(tempJobDir, { recursive: true, force: true });
    }
  }
}

export const renderService = new RenderService();
