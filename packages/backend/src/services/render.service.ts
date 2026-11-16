import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import type { StoryboardPlan, VideoConfig } from '@edumotion/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);

export interface RenderResult {
  videoPath: string;
  thumbnailPath: string | null;
  durationSec: number;
  sizeBytes: number;
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
  ): Promise<RenderResult> {
    const framesDir = path.join(config.storage.tempDir, jobId, 'frames');
    const finalPath = path.join(
      config.storage.videosDir,
      `${jobId}-${Date.now()}.mp4`,
    );
    const thumbPath = path.join(
      config.storage.thumbnailsDir,
      `${jobId}.jpg`,
    );

    fs.mkdirSync(framesDir, { recursive: true });

    try {
      onProgress?.(5);

      // Write storyboard JSON for the renderer process
      const storyboardPath = path.join(config.storage.tempDir, jobId, 'storyboard.json');
      fs.writeFileSync(storyboardPath, JSON.stringify(storyboard), 'utf-8');

      onProgress?.(10);

      // Render PNG sequence via @remotion/renderer CLI
      await this.renderFrames(
        storyboardPath,
        framesDir,
        storyboard.totalFrames,
        videoConfig,
        onProgress,
      );

      onProgress?.(75);

      // Mux frames + audio to MP4
      await this.muxVideo(
        framesDir,
        audioPath,
        finalPath,
        videoConfig.fps,
        storyboard.totalFrames,
      );

      onProgress?.(90);

      // Extract thumbnail at 1 second
      await this.extractThumbnail(finalPath, thumbPath);

      onProgress?.(95);

      // Validate output
      await this.validateOutput(finalPath);

      const stat = fs.statSync(finalPath);
      const durationSec = storyboard.totalFrames / videoConfig.fps;

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
    storyboardPath: string,
    framesDir: string,
    totalFrames: number,
    videoConfig: VideoConfig,
    onProgress?: (pct: number) => void,
  ): Promise<void> {
    const rendererRoot = path.resolve(__dirname, '../../../renderer');
    const entryPoint = path.join(rendererRoot, 'src', 'root.tsx');

    return new Promise((resolve, reject) => {
      const args = [
        'render',
        entryPoint,
        'EduVideo',
        '--output', framesDir,
        '--image-format', 'jpeg',
        '--jpeg-quality', '85',
        '--props', JSON.stringify({ storyboardPath }),
        '--log', 'verbose',
      ];

      const child = spawn('npx', ['remotion', ...args], {
        cwd: rendererRoot,
        env: process.env,
      });

      let stderr = '';
      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
        // Parse progress from remotion output
        const match = /Rendering frame (\d+)/.exec(data.toString());
        if (match?.[1]) {
          const frame = parseInt(match[1], 10);
          const pct = 10 + Math.round((frame / totalFrames) * 65);
          onProgress?.(pct);
        }
      });

      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Remotion render failed (exit ${code}): ${stderr.slice(-500)}`));
      });
    });
  }

  async muxVideo(
    framesDir: string,
    audioPath: string,
    outputPath: string,
    fps: number,
    _totalFrames: number,
  ): Promise<void> {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const hasAudio = fs.existsSync(audioPath);
    const audioArgs = hasAudio
      ? [`-i`, audioPath, `-c:a`, `aac`, `-b:a`, `128k`]
      : [];

    const cmd = [
      'ffmpeg', '-y',
      '-framerate', String(fps),
      '-i', path.join(framesDir, 'frame%06d.jpeg'),
      ...audioArgs,
      '-c:v', 'libx264',
      '-crf', '23',
      '-preset', 'fast',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outputPath,
    ].join(' ');

    const { stderr } = await execAsync(cmd, { timeout: 300000 });
    if (!fs.existsSync(outputPath)) {
      throw new Error(`FFmpeg mux failed. stderr: ${stderr.slice(-500)}`);
    }
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
