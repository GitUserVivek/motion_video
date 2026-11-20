import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import type { SubtitleEntry, TtsEngine } from '@edumotion/shared';

// Augment PATH to include common pip install locations
const EXTRA_PATHS = [
  '/usr/local/bin',
  '/usr/bin',
  `${process.env['HOME'] ?? '/root'}/.local/bin`,
  '/opt/conda/bin',
  '/kaggle/working/.local/bin',
].join(':');

const ENV_WITH_PATH = {
  ...process.env,
  PATH: `${EXTRA_PATHS}:${process.env['PATH'] ?? ''}`,
};

export interface TtsSynthesisResult {
  audioPath: string;
  durationMs: number;
  /** Caption cues measured by the TTS engine itself, when it provides them. */
  subtitles?: SubtitleEntry[];
}

class TtsService {
  private detectedEngine: TtsEngine | null = null;
  private edgeTtsCmd: string = 'edge-tts';
  private edgeTtsSupportsSubtitles = false;

  async selectEngine(): Promise<TtsEngine> {
    if (this.detectedEngine) return this.detectedEngine;

    // Try edge-tts binary (direct or via augmented PATH)
    for (const cmd of ['edge-tts', 'python3 -m edge_tts', 'python -m edge_tts']) {
      const [bin, ...prefix] = cmd.split(' ');
      if (!bin) continue;

      try {
        await this.runCommand(bin, [...prefix, '--version'], 10000);

        // Word-boundary captions are exact timings from the TTS engine; only
        // enabled when this build of edge-tts advertises the option, so an old
        // CLI never breaks synthesis.
        const help = await this.runCommand(bin, [...prefix, '--help'], 10000).catch(() => null);
        this.edgeTtsSupportsSubtitles = help != null &&
          /--write-subtitles/.test(`${help.stdout}\n${help.stderr}`);

        this.edgeTtsCmd = cmd;
        this.detectedEngine = 'edge-tts';
        console.log(
          `[TTS] Using edge-tts via: ${cmd}` +
            `${this.edgeTtsSupportsSubtitles ? ' (word-boundary captions)' : ''}`,
        );
        return 'edge-tts';
      } catch { /* try next */ }
    }

    // Try espeak-ng
    for (const cmd of ['espeak-ng', 'espeak']) {
      try {
        await this.runCommand(cmd, ['--version'], 10000);
        this.detectedEngine = 'espeak';
        console.log(`[TTS] Using espeak: ${cmd}`);
        return 'espeak';
      } catch { /* try next */ }
    }

    throw new Error(
      'No TTS engine found. Run: pip install edge-tts   or   apt install espeak-ng',
    );
  }

  /**
   * Pick the engine that will actually run: an explicitly configured `espeak`
   * is honoured, anything else probes edge-tts first and falls back to espeak
   * so a missing binary degrades instead of failing the job.
   */
  private async resolveEngine(override?: TtsEngine): Promise<TtsEngine> {
    if (override === 'espeak' || config.tts.engine === 'espeak') return 'espeak';
    // 'edge-tts' and 'kokoro' both mean "prefer edge-tts": selectEngine still
    // falls back to espeak when the binary is missing, instead of failing.
    return this.selectEngine();
  }

  async synthesize(
    text: string,
    voice: string,
    outputPath: string,
    engineOverride?: TtsEngine,
  ): Promise<TtsSynthesisResult> {
    const engine = await this.resolveEngine(engineOverride);
    console.log(`[TTS] Requested voice: ${voice} (engine: ${engine})`);

    const wavPath = outputPath.endsWith('.wav') ? outputPath : `${outputPath}.wav`;
    const mp3Path = wavPath.replace(/\.wav$/, '.mp3');
    const srtPath = wavPath.replace(/\.wav$/, '.srt');

    fs.mkdirSync(path.dirname(wavPath), { recursive: true });
    // Never reuse audio from an earlier attempt: a stale file would hide a
    // failed synthesis and desync subtitles against the previous narration.
    this.removeIfExists(wavPath);
    this.removeIfExists(mp3Path);
    this.removeIfExists(srtPath);

    const textFile = `${wavPath}.input.txt`;
    fs.writeFileSync(textFile, text, 'utf-8');

    const startedAt = Date.now();
    let measuredCues: SubtitleEntry[] = [];

    try {
      if (engine === 'edge-tts') {
        // edge-tts only writes MP3, so it always needs the WAV conversion below.
        await this.synthesizeEdgeTts(textFile, voice, mp3Path, srtPath);
      } else {
        await this.synthesizeEspeak(textFile, wavPath);
      }
    } finally {
      this.removeIfExists(textFile);
    }

    if (engine === 'edge-tts') {
      if (!fs.existsSync(mp3Path) || fs.statSync(mp3Path).size === 0) {
        throw new Error(`edge-tts produced no audio file at ${mp3Path}`);
      }

      if (this.edgeTtsSupportsSubtitles) {
        try {
          measuredCues = this.readSrt(srtPath);
        } catch (err) {
          console.warn(
            '[TTS] Could not parse edge-tts captions, falling back to proportional timing:',
            err instanceof Error ? err.message : String(err),
          );
        }
        this.removeIfExists(srtPath);
      }

      await this.convertToWav(mp3Path, wavPath);
      this.removeIfExists(mp3Path);
    }

    if (!fs.existsSync(wavPath) || fs.statSync(wavPath).size === 0) {
      throw new Error(`TTS produced no audio file at ${wavPath}`);
    }

    const durationMs = await this.detectDuration(wavPath);

    // Clamp cues to the actual audio length so no caption outlives the video.
    const subtitles = measuredCues
      .filter((cue) => cue.startMs < durationMs)
      .map((cue, index) => ({
        ...cue,
        index,
        endMs: Math.min(cue.endMs, durationMs),
      }));

    console.log(
      `[TTS] Synthesized ${(durationMs / 1000).toFixed(1)}s of audio with ${engine} in ${
        Date.now() - startedAt
      }ms` + (subtitles.length > 0 ? ` (${subtitles.length} measured caption cues)` : ''),
    );

    return {
      audioPath: wavPath,
      durationMs,
      ...(subtitles.length > 0 ? { subtitles } : {}),
    };
  }

  /**
   * Run a child process with a hard deadline.
   *
   * `exec`'s built-in timeout only signals the `/bin/sh` wrapper. When the real
   * command (edge-tts is a Python program) survives that signal it keeps the
   * inherited stdio pipes open, so the exec callback never fires and the job
   * hangs silently forever. The child is therefore spawned as its own process
   * group and the whole group is killed when the deadline passes.
   */
  private runCommand(
    command: string,
    args: string[],
    timeoutMs: number,
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        env: ENV_WITH_PATH,
        detached: process.platform !== 'win32',
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const settle = (): boolean => {
        if (settled) return false;
        settled = true;
        clearTimeout(timer);
        return true;
      };

      const timer = setTimeout(() => {
        if (!settle()) return;
        this.killTree(child);
        reject(
          new Error(
            `Command timed out after ${timeoutMs}ms: ${command} ${args.join(' ')}`,
          ),
        );
      }, timeoutMs);

      child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

      child.on('error', (err) => {
        if (!settle()) return;
        reject(new Error(`Could not run ${command}: ${err.message}`));
      });

      child.on('close', (code) => {
        if (!settle()) return;
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }
        const detail = (stderr.trim() || stdout.trim()).slice(-400);
        reject(new Error(`${command} exited with code ${code}: ${detail}`));
      });
    });
  }

  private killTree(child: ChildProcess): void {
    try {
      if (child.pid && process.platform !== 'win32') {
        // Negative pid targets the whole group created by `detached: true`.
        process.kill(-child.pid, 'SIGKILL');
        return;
      }
    } catch { /* fall through to single-process kill */ }
    try { child.kill('SIGKILL'); } catch { /* already gone */ }
  }

  private removeIfExists(filePath: string): void {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  private async synthesizeEdgeTts(
    textFile: string,
    voice: string,
    mp3Path: string,
    srtPath: string,
  ): Promise<void> {
    const [bin, ...prefix] = this.edgeTtsCmd.split(' ');
    if (!bin) throw new Error('edge-tts command is empty');

    const args = [
      ...prefix,
      '--voice', voice,
      '--file', textFile,
      '--write-media', mp3Path,
    ];
    if (this.edgeTtsSupportsSubtitles) {
      args.push('--write-subtitles', srtPath);
    }

    const { stderr } = await this.runCommand(bin, args, 120000);
    if (stderr) console.warn('[TTS] edge-tts stderr:', stderr.slice(0, 300));
  }

  private async synthesizeEspeak(textFile: string, wavPath: string): Promise<void> {
    for (const bin of ['espeak-ng', 'espeak']) {
      try {
        await this.runCommand(
          bin,
          ['-f', textFile, '-w', wavPath, '-s', '150', '-a', '200'],
          120000,
        );
        return;
      } catch { /* try next */ }
    }
    throw new Error('espeak synthesis failed');
  }

  private async convertToWav(inputPath: string, wavPath: string): Promise<void> {
    try {
      await this.runCommand(
        'ffmpeg',
        ['-y', '-i', inputPath, '-vn', '-acodec', 'pcm_s16le', wavPath],
        120000,
      );
    } catch (err) {
      throw new Error(
        `ffmpeg is required to convert TTS audio to WAV but failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Parse the SRT that edge-tts writes from its WordBoundary events. Those
   * timings come from the engine, so captions land on the spoken words instead
   * of being estimated from character counts.
   */
  private readSrt(srtPath: string): SubtitleEntry[] {
    if (!fs.existsSync(srtPath)) return [];

    const entries: SubtitleEntry[] = [];
    const blocks = fs.readFileSync(srtPath, 'utf-8').replace(/\r/g, '').split(/\n{2,}/);

    for (const block of blocks) {
      const lines = block.split('\n').filter((line) => line.trim().length > 0);
      const timeLine = lines.find((line) => line.includes('-->'));
      if (!timeLine) continue;

      const match =
        /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/.exec(
          timeLine,
        );
      if (!match) continue;

      const startMs = this.srtTimeToMs(match[1], match[2], match[3], match[4]);
      const endMs = this.srtTimeToMs(match[5], match[6], match[7], match[8]);
      const text = lines
        .slice(lines.indexOf(timeLine) + 1)
        .join(' ')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (!text || endMs <= startMs) continue;
      entries.push({ index: entries.length, startMs, endMs, text });
    }

    return entries;
  }

  private srtTimeToMs(
    hours?: string,
    minutes?: string,
    seconds?: string,
    millis?: string,
  ): number {
    const ms = Number((millis ?? '0').padEnd(3, '0'));
    return (
      (Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0)) * 1000 +
      ms
    );
  }

  async detectDuration(audioPath: string): Promise<number> {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const { stdout } = await this.runCommand(
      'ffprobe',
      ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', audioPath],
      30000,
    );
    const data = JSON.parse(stdout) as {
      streams?: Array<{ duration?: string; codec_type: string }>;
      format?: { duration?: string };
    };

    // Container duration is present for WAV/MP3 even when the stream omits it.
    const raw =
      data.streams?.find((s) => s.codec_type === 'audio')?.duration ??
      data.format?.duration;

    const seconds = raw ? parseFloat(raw) : NaN;
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new Error(`Cannot detect audio duration for: ${audioPath}`);
    }
    return Math.round(seconds * 1000);
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.selectEngine();
      return true;
    } catch {
      return false;
    }
  }
}

export const ttsService = new TtsService();
