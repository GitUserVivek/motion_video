import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import type { TtsEngine } from '@edumotion/shared';

const execAsync = promisify(exec);

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
}

class TtsService {
  private detectedEngine: TtsEngine | null = null;
  private edgeTtsCmd: string = 'edge-tts';

  async selectEngine(): Promise<TtsEngine> {
    if (this.detectedEngine) return this.detectedEngine;

    // Try edge-tts binary (direct or via augmented PATH)
    for (const cmd of ['edge-tts', 'python3 -m edge_tts', 'python -m edge_tts']) {
      try {
        await execAsync(`${cmd} --version`, { env: ENV_WITH_PATH, timeout: 10000 });
        this.edgeTtsCmd = cmd;
        this.detectedEngine = 'edge-tts';
        console.log(`[TTS] Using edge-tts via: ${cmd}`);
        return 'edge-tts';
      } catch { /* try next */ }
    }

    // Try espeak-ng
    for (const cmd of ['espeak-ng', 'espeak']) {
      try {
        await execAsync(`${cmd} --version`, { env: ENV_WITH_PATH, timeout: 10000 });
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
  private async resolveEngine(): Promise<TtsEngine> {
    if (config.tts.engine === 'espeak') return 'espeak';
    return this.selectEngine();
  }

  async synthesize(
    text: string,
    voice: string,
    outputPath: string,
  ): Promise<TtsSynthesisResult> {
    const engine = await this.resolveEngine();

    const wavPath = outputPath.endsWith('.wav') ? outputPath : `${outputPath}.wav`;
    const mp3Path = wavPath.replace(/\.wav$/, '.mp3');

    fs.mkdirSync(path.dirname(wavPath), { recursive: true });
    // Never reuse audio from an earlier attempt: a stale file would hide a
    // failed synthesis and desync subtitles against the previous narration.
    this.removeIfExists(wavPath);
    this.removeIfExists(mp3Path);

    const textFile = `${wavPath}.input.txt`;
    fs.writeFileSync(textFile, text, 'utf-8');

    try {
      if (engine === 'edge-tts') {
        // edge-tts only writes MP3, so it always needs the WAV conversion below.
        await this.synthesizeEdgeTts(textFile, voice, mp3Path);
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
      await this.convertToWav(mp3Path, wavPath);
      this.removeIfExists(mp3Path);
    }

    if (!fs.existsSync(wavPath) || fs.statSync(wavPath).size === 0) {
      throw new Error(`TTS produced no audio file at ${wavPath}`);
    }

    const durationMs = await this.detectDuration(wavPath);
    return { audioPath: wavPath, durationMs };
  }

  private removeIfExists(filePath: string): void {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  private async synthesizeEdgeTts(
    textFile: string,
    voice: string,
    mp3Path: string,
  ): Promise<void> {
    const cmd = `${this.edgeTtsCmd} --voice "${voice}" --file "${textFile}" --write-media "${mp3Path}"`;
    try {
      const { stderr } = await execAsync(cmd, { env: ENV_WITH_PATH, timeout: 120000 });
      if (stderr) console.warn('[TTS] edge-tts stderr:', stderr.slice(0, 300));
    } catch (err) {
      throw new Error(`edge-tts failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async synthesizeEspeak(textFile: string, wavPath: string): Promise<void> {
    for (const cmd of [
      `espeak-ng -f "${textFile}" -w "${wavPath}" -s 150 -a 200`,
      `espeak -f "${textFile}" -w "${wavPath}" -s 150 -a 200`,
    ]) {
      try {
        await execAsync(cmd, { env: ENV_WITH_PATH, timeout: 120000 });
        return;
      } catch { /* try next */ }
    }
    throw new Error('espeak synthesis failed');
  }

  private async convertToWav(inputPath: string, wavPath: string): Promise<void> {
    try {
      await execAsync(
        `ffmpeg -y -i "${inputPath}" -vn -acodec pcm_s16le "${wavPath}"`,
        { env: ENV_WITH_PATH, timeout: 120000 },
      );
    } catch (err) {
      throw new Error(
        `ffmpeg is required to convert TTS audio to WAV but failed: ${
          err instanceof Error ? err.message.slice(-400) : String(err)
        }`,
      );
    }
  }

  async detectDuration(audioPath: string): Promise<number> {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${audioPath}"`,
      { env: ENV_WITH_PATH },
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
