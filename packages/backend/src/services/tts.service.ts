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

  async synthesize(
    text: string,
    voice: string,
    outputPath: string,
  ): Promise<TtsSynthesisResult> {
    const engine = config.tts.engine !== 'kokoro'
      ? config.tts.engine
      : await this.selectEngine();

    // If configured engine is edge-tts but it's not found yet, detect it
    if (engine === 'edge-tts' && !this.detectedEngine) {
      await this.selectEngine();
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const textFile = outputPath + '.input.txt';
    fs.writeFileSync(textFile, text, 'utf-8');

    try {
      if (engine === 'edge-tts') {
        await this.synthesizeEdgeTts(textFile, voice, outputPath);
      } else {
        await this.synthesizeEspeak(textFile, outputPath);
      }
    } finally {
      if (fs.existsSync(textFile)) fs.unlinkSync(textFile);
    }

    // Convert mp3 → wav (edge-tts outputs mp3)
    const wavPath = outputPath.endsWith('.wav')
      ? outputPath
      : outputPath.replace(/\.mp3$/, '.wav');

    if (!outputPath.endsWith('.wav') && fs.existsSync(outputPath)) {
      await execAsync(`ffmpeg -y -i "${outputPath}" "${wavPath}"`, { env: ENV_WITH_PATH });
      fs.unlinkSync(outputPath);
    }

    const durationMs = await this.detectDuration(wavPath);
    return { audioPath: wavPath, durationMs };
  }

  private async synthesizeEdgeTts(
    textFile: string,
    voice: string,
    outputPath: string,
  ): Promise<void> {
    const mp3Path = outputPath.endsWith('.mp3')
      ? outputPath
      : outputPath.replace(/\.wav$/, '.mp3');

    const cmd = `${this.edgeTtsCmd} --voice "${voice}" --file "${textFile}" --write-media "${mp3Path}"`;
    await execAsync(cmd, { env: ENV_WITH_PATH, timeout: 120000 });
  }

  private async synthesizeEspeak(textFile: string, outputPath: string): Promise<void> {
    const wavPath = outputPath.endsWith('.wav')
      ? outputPath
      : outputPath.replace(/\.mp3$/, '.wav');

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

  async detectDuration(audioPath: string): Promise<number> {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_streams "${audioPath}"`,
      { env: ENV_WITH_PATH },
    );
    const data = JSON.parse(stdout) as {
      streams: Array<{ duration?: string; codec_type: string }>;
    };
    const audioStream = data.streams.find((s) => s.codec_type === 'audio');
    if (!audioStream?.duration) {
      throw new Error(`Cannot detect audio duration for: ${audioPath}`);
    }
    return Math.round(parseFloat(audioStream.duration) * 1000);
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
