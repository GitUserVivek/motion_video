import fs from 'fs';
import path from 'path';
import type { SubtitleEntry } from '@edumotion/shared';
import { WORDS_PER_SECOND } from '@edumotion/shared';

/** Longest caption phrase we are willing to put on screen. */
const MAX_CUE_WORDS = 7;
const MAX_CUE_CHARS = 48;

class SubtitleService {
  /**
   * Split a script into subtitle entries aligned to the total audio duration.
   * Uses proportional word-count timing to distribute entries.
   */
  generateSubtitles(
    script: string,
    audioDurationMs: number,
  ): SubtitleEntry[] {
    const sentences = this.splitIntoSentences(script);
    if (sentences.length === 0) return [];

    const totalWords = sentences.reduce((sum, s) => sum + this.wordCount(s), 0);
    const entries: SubtitleEntry[] = [];
    let currentMs = 0;

    sentences.forEach((sentence, i) => {
      const words = this.wordCount(sentence);
      const proportion = totalWords > 0 ? words / totalWords : 1 / sentences.length;
      const durationMs = Math.round(proportion * audioDurationMs);
      const endMs = Math.min(currentMs + durationMs, audioDurationMs);

      entries.push({
        index: i,
        startMs: currentMs,
        endMs,
        text: sentence.trim(),
      });

      currentMs = endMs;
    });

    // Ensure last entry reaches audio end
    if (entries.length > 0) {
      const last = entries[entries.length - 1];
      if (last) last.endMs = audioDurationMs;
    }

    return entries;
  }

  /**
   * edge-tts writes one SRT cue per *spoken word* (WordBoundary events), so the
   * renderer would flash a single word at a time. Merge those cues into readable
   * phrases and keep each word's own timing on the phrase, which is what the
   * Subtitle component uses to highlight the word being spoken.
   *
   * Cues that are already phrase-level (espeak, or an engine without word
   * boundaries) are returned untouched.
   */
  groupWordCues(cues: SubtitleEntry[]): SubtitleEntry[] {
    if (cues.length < 2) return cues;

    const totalWords = cues.reduce((sum, cue) => sum + this.wordCount(cue.text), 0);
    if (totalWords / cues.length > 1.6) return cues;

    const grouped: SubtitleEntry[] = [];
    let pending: SubtitleEntry[] = [];

    const flush = (): void => {
      const first = pending[0];
      const last = pending[pending.length - 1];
      if (!first || !last) {
        pending = [];
        return;
      }

      grouped.push({
        index: grouped.length,
        startMs: first.startMs,
        endMs: last.endMs,
        // Words arrive one per cue, so punctuation is usually its own cue
        // ("biology" + "."); glue it to the previous word.
        text: pending
          .map((cue) => cue.text.trim())
          .join(' ')
          .replace(/\s+([,.!?;:%])/g, '$1')
          .replace(/\s+/g, ' ')
          .trim(),
        words: pending.map((cue) => ({
          text: cue.text.trim(),
          startMs: cue.startMs,
          endMs: cue.endMs,
        })),
      });

      pending = [];
    };

    for (const cue of cues) {
      const words = this.wordCount(cue.text);
      const chars = pending.reduce((sum, item) => sum + item.text.length + 1, 0) + cue.text.length;

      if (pending.length > 0 && (pending.length + words > MAX_CUE_WORDS || chars > MAX_CUE_CHARS)) {
        flush();
      }
      pending.push(cue);
    }
    flush();

    return grouped.length > 0 ? grouped : cues;
  }

  /**
   * Distribute subtitle entries across scenes proportionally.
   * Returns a map of sceneId -> SubtitleEntry[]
   */
  alignToScenes(
    subtitles: SubtitleEntry[],
    scenes: Array<{ id: string; startFrame: number; endFrame: number; fps: number }>,
  ): Map<string, SubtitleEntry[]> {
    const result = new Map<string, SubtitleEntry[]>();

    for (const scene of scenes) {
      const sceneStartMs = (scene.startFrame / scene.fps) * 1000;
      const sceneEndMs = (scene.endFrame / scene.fps) * 1000;

      const sceneSubtitles = subtitles.filter(
        (s) => s.startMs < sceneEndMs && s.endMs > sceneStartMs,
      );

      result.set(scene.id, sceneSubtitles);
    }

    return result;
  }

  /**
   * Write SRT format subtitle file.
   */
  writeSrt(entries: SubtitleEntry[], outputPath: string): void {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const lines = entries.map((e) => {
      return [
        String(e.index + 1),
        `${this.msToSrtTime(e.startMs)} --> ${this.msToSrtTime(e.endMs)}`,
        e.text,
        '',
      ].join('\n');
    });
    fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
  }

  /**
   * Write JSON subtitle file.
   */
  writeJson(entries: SubtitleEntry[], outputPath: string): void {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(entries, null, 2), 'utf-8');
  }

  private splitIntoSentences(text: string): string[] {
    // Split on sentence-ending punctuation, keeping reasonable chunk sizes
    const raw = text
      .replace(/\n+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // Merge very short fragments (< 4 words) with the next sentence
    const merged: string[] = [];
    let buffer = '';

    for (const sentence of raw) {
      buffer = buffer ? `${buffer} ${sentence}` : sentence;
      if (this.wordCount(buffer) >= 4) {
        merged.push(buffer);
        buffer = '';
      }
    }
    if (buffer) merged.push(buffer);

    return merged;
  }

  private wordCount(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
  }

  private msToSrtTime(ms: number): string {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const msRemainder = ms % 1000;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(msRemainder).padStart(3, '0')}`;
  }
}

export const subtitleService = new SubtitleService();
