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

      const sceneSubtitles: SubtitleEntry[] = [];
      for (const cue of subtitles) {
        if (cue.startMs >= sceneEndMs || cue.endMs <= sceneStartMs) continue;
        const clipped = this.clipCueToWindow(cue, sceneStartMs, sceneEndMs);
        if (clipped) sceneSubtitles.push(clipped);
      }

      result.set(scene.id, sceneSubtitles);
    }

    return result;
  }

  /**
   * Clip a cue to one scene window. A cue crossing a boundary is split into two
   * scene-local pieces instead of being copied whole into both scenes. When the
   * engine supplied word timings, the split follows them; otherwise words are
   * divided proportionally across the cue's duration and marked as estimated.
   */
  private clipCueToWindow(
    cue: SubtitleEntry,
    windowStartMs: number,
    windowEndMs: number,
  ): SubtitleEntry | null {
    const startMs = Math.max(cue.startMs, windowStartMs);
    const endMs = Math.min(cue.endMs, windowEndMs);
    if (endMs <= startMs) return null;

    // Whole cue is already inside this scene.
    if (startMs === cue.startMs && endMs === cue.endMs) {
      return cue;
    }

    const words = cue.words;
    if (words && words.length > 0) {
      const keptWords = words
        .filter((word) => word.endMs > startMs && word.startMs < endMs)
        .map((word) => ({
          ...word,
          startMs: Math.max(word.startMs, startMs),
          endMs: Math.min(word.endMs, endMs),
        }))
        .filter((word) => word.endMs > word.startMs);
      const text = keptWords.map((word) => word.text).join(' ');
      if (!text.trim()) return null;
      return {
        ...cue,
        startMs,
        endMs,
        text: text.replace(/\s+([,.!?;:%])/g, '$1').trim(),
        words: keptWords,
      };
    }

    const text = this.textForWindow(cue, startMs, endMs);
    if (!text) return null;
    return { ...cue, startMs, endMs, text };
  }

  /** Split a cue without word timings at a proportional word boundary. */
  private textForWindow(cue: SubtitleEntry, startMs: number, endMs: number): string {
    const words = cue.text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '';

    const duration = Math.max(1, cue.endMs - cue.startMs);
    const from = Math.max(0, Math.floor(((startMs - cue.startMs) / duration) * words.length));
    const to = Math.min(
      words.length,
      Math.max(from + 1, Math.ceil(((endMs - cue.startMs) / duration) * words.length)),
    );
    return words.slice(from, to).join(' ');
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
