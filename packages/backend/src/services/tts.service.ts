import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import type { TtsEngine } from '@edumotion/shared';

const execAsync = promisify(exec);

export interface TtsSynthesisResult {
  audioPath: string;
  durationMs: number;
}

class TtsService {
  private detectedEngine: TtsEngine | null = null;

  async selectEngine(): Promise<TtsEngine> {
    if (this.detectedEngine) return this.detectedEngine;

    // Try edge-tts first
    try {
      await execAsync('edge-tts --version');
      this.detectedEngine = 'edge-tts';
      return 'edge-tts';
    } catch { /* not found */ }

    // Try espeak-ng
    try {
      await execAsync('espeak-ng --version');
      this.detectedEngine = 'espeak';
      return 'espeak';
    } catch { /* not found */ }

    // Try espeak (no -ng suffix)
    try {
      await execAsync('espeak --version');
      this.detectedEngine = 'espeak';
      return 'espeak';
    } catch { /* not found */ }

    throw new Error(
      'No TTS engine found. Install edge-tts (pip install edge-tts) or espeak-ng.',
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

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    // Sanitise text for shell safety — write to temp file and pass by path
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

    // Convert to WAV if output is mp3 (edge-tts outputs mp3)
    const wavPath = outputPath.endsWith('.wav') ? outputPath : outputPath.replace(/\.mp3$/, '.wav');
    if (!outputPath.endsWith('.wav') && fs.existsSync(outputPath)) {
      await execAsync(`ffmpeg -y -i "${outputPath}" "${wavPath}"`);
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
    const mp3Path = outputPath.endsWith('.mp3') ? outputPath : outputPath.replace(/\.wav$/, '.mp3');
    const cmd = `edge-tts --voice "${voice}" --file "${textFile}" --write-media "${mp3Path}"`;
    await execAsync(cmd, { timeout: 120000 });
  }

  private async synthesizeEspeak(
    textFile: string,
    outputPath: string,
  ): Promise<void> {
    const wavPath = outputPath.endsWith('.wav') ? outputPath : outputPath.replace(/\.mp3$/, '.wav');
    const cmd = `espeak-ng -f "${textFile}" -w "${wavPath}" -s 150 -a 200`;
    try {
      await execAsync(cmd, { timeout: 120000 });
    } catch {
      // try espeak without -ng
      const fallback = `espeak -f "${textFile}" -w "${wavPath}" -s 150 -a 200`;
      await execAsync(fallback, { timeout: 120000 });
    }
  }

  async detectDuration(audioPath: string): Promise<number> {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_streams "${audioPath}"`,
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
