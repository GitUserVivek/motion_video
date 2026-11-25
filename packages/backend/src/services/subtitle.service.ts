import fs from 'fs';
import path from 'path';
import type { SceneInstruction, SubtitleEntry } from '@edumotion/shared';
import { WORDS_PER_SECOND } from '@edumotion/shared';

/** Longest caption phrase we are willing to put on screen. */
const MAX_CUE_WORDS = 7;
// Devanagari words are visually dense; 48 characters cut a phrase before its
// natural comma. 64 keeps the phrase without making the line unreadable.
const MAX_CUE_CHARS = 64;

/** Words that must not be the last thing on screen in a cue. */
const CUE_CONNECTORS = new Set([
  'and', 'but', 'or', 'so', 'because', 'which', 'that', 'while', 'with', 'of', 'to', 'in', 'on', 'for',
  'आणि', 'व', 'पण', 'परंतु', 'किंवा', 'म्हणून', 'कारण', 'म्हणजे', 'की', 'जे', 'जी', 'ते', 'त्या',
]);

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
   * Split long cues (including sentence-level cues from an engine that does not
   * expose word boundaries) into readable phrases. A 19-word Marathi sentence
   * used to sit on screen for 12 seconds; the viewer had no chance to read it.
   *
   * Timing is distributed by word count. Punctuation is preferred as a break,
   * and a chunk never ends on a connector such as `आणि` or `and`.
   */
  splitLongCues(entries: SubtitleEntry[]): SubtitleEntry[] {
    const split: SubtitleEntry[] = [];

    for (const cue of entries) {
      const text = cue.text.replace(/\s+/g, ' ').trim();
      const words = text.split(/\s+/).filter(Boolean);
      if (
        words.length <= MAX_CUE_WORDS
        && text.length <= MAX_CUE_CHARS
      ) {
        split.push(cue);
        continue;
      }

      const chunks: string[] = [];
      let current: string[] = [];
      let currentChars = 0;

      const flush = (): void => {
        if (current.length > 0) chunks.push(current.join(' '));
        current = [];
        currentChars = 0;
      };

      for (const word of words) {
        const nextChars = currentChars + (current.length > 0 ? 1 : 0) + word.length;
        const last = current[current.length - 1] ?? '';
        const lastBare = last.replace(/[,;:.!?।॥—–]+$/u, '').toLowerCase();
        const mayBreak = current.length > 0 && !CUE_CONNECTORS.has(lastBare);

        if (
          mayBreak
          && (current.length + 1 > MAX_CUE_WORDS || nextChars > MAX_CUE_CHARS)
        ) {
          flush();
        }

        current.push(word);
        currentChars = current.length === 1 ? word.length : currentChars + 1 + word.length;

        // A sentence end is always a boundary; a comma or semicolon is used
        // once the chunk has enough words to stand alone.
        const isSentenceEnd = /[.!?।॥]$/u.test(word);
        if (isSentenceEnd && word !== words[words.length - 1]) {
          flush();
        } else if (current.length >= 3 && /[,;:—–]$/u.test(word)) {
          flush();
        }
      }
      flush();

      // A one-word tail is a flash, not a caption. Fold it into the previous
      // chunk (the merged chunk stays within the 9-word ceiling in practice).
      if (chunks.length > 1 && (chunks[chunks.length - 1] ?? '').split(/\s+/).filter(Boolean).length === 1) {
        const tail = chunks.pop()!;
        chunks[chunks.length - 1] = `${chunks[chunks.length - 1]} ${tail}`.trim();
      }

      if (chunks.length <= 1) {
        split.push({ ...cue, text });
        continue;
      }

      const totalWords = words.length || 1;
      const sourceWords = cue.words ? [...cue.words] : undefined;
      let cursor = cue.startMs;
      chunks.forEach((chunk, index) => {
        const chunkWords = chunk.split(/\s+/).filter(Boolean).length;
        const isLast = index === chunks.length - 1;
        const endMs = isLast
          ? cue.endMs
          : Math.min(cue.endMs, cursor + Math.round(((cue.endMs - cue.startMs) * chunkWords) / totalWords));

        let chunkTimings: NonNullable<SubtitleEntry['words']> | undefined;
        if (sourceWords && sourceWords.length > 0) {
          // Use the engine's own word timings when they exist; otherwise the
          // proportional estimate above keeps the captions in step.
          chunkTimings = sourceWords.slice(0, chunkWords).map((word) => ({ ...word }));
          sourceWords.splice(0, chunkWords);
        }

        split.push({
          ...cue,
          index: split.length,
          startMs: cursor,
          endMs,
          text: chunk,
          ...(chunkTimings && chunkTimings.length > 0 ? { words: chunkTimings } : { words: undefined }),
        });
        cursor = endMs;
      });
    }

    return split.map((cue, index) => ({ ...cue, index }));
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
          .replace(/\s+([,.!?;:%।॥])/g, '$1')
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
   * Make cue display ranges non-overlapping.
   *
   * Some TTS engines emit phrase cues whose end timestamp slightly overlaps the
   * next cue's start. Two captions cannot be painted at once, so the earlier cue
   * is clipped at the later cue's start. Word timings on the clipped cue are
   * trimmed to the same range so highlighting cannot outlive the caption.
   */
  normalizeCueTimeline(entries: SubtitleEntry[]): SubtitleEntry[] {
    const sorted = [...entries].sort(
      (a, b) => a.startMs - b.startMs || a.endMs - b.endMs,
    );
    const normalized: SubtitleEntry[] = [];

    for (const cue of sorted) {
      const previous = normalized[normalized.length - 1];
      if (previous && cue.startMs < previous.endMs - 1) {
        const splitAt = cue.startMs;
        if (splitAt <= previous.startMs) {
          // The later cue starts at or before the previous cue. Keeping both
          // would paint two captions over the same frames; the later one wins.
          normalized.pop();
        } else {
          previous.endMs = splitAt;
          if (previous.words) {
            previous.words = this.trimWords(previous.words, previous.startMs, splitAt);
          }
        }
      }

      normalized.push({ ...cue, index: normalized.length });
    }

    return normalized;
  }

  /** Keep only word timings that fall inside a cue's display range. */
  private trimWords(
    words: NonNullable<SubtitleEntry['words']>,
    startMs: number,
    endMs: number,
  ): NonNullable<SubtitleEntry['words']> {
    return words
      .filter((word) => word.endMs > startMs && word.startMs < endMs)
      .map((word) => ({
        ...word,
        startMs: Math.max(word.startMs, startMs),
        endMs: Math.min(word.endMs, endMs),
      }))
      .filter((word) => word.endMs > word.startMs);
  }

  /**
   * Move scene boundaries onto nearby caption edges, so a scene does not start
   * or end in the middle of a spoken phrase. This is what makes the caption
   * chunks usable: the edit is only accepted when both neighbouring scenes keep
   * a minimum duration.
   */
  snapSceneBoundaries(
    scenes: SceneInstruction[],
    cues: SubtitleEntry[],
    fps: number,
    maxShiftMs = 1500,
    // A one-second scene is allowed here; the snap must be able to reach the
    // last caption edge in a short closing scene.
    minFrames = 30,
  ): { scenes: SceneInstruction[]; shifted: number } {
    if (scenes.length < 2 || cues.length === 0) return { scenes, shifted: 0 };
    const maxShift = (maxShiftMs / 1000) * fps;
    const edges = [...new Set(
      cues.flatMap((cue) => [cue.startMs, cue.endMs])
        .map((ms) => Math.round((ms / 1000) * fps)),
    )].sort((a, b) => a - b);

    const next = scenes.map((scene) => ({ ...scene }));
    let shifted = 0;

    for (let index = 0; index < next.length - 1; index++) {
      const current = next[index];
      const following = next[index + 1];
      if (!current || !following) continue;

      const boundary = current.endFrame;
      const candidates = edges.filter((frame) =>
        Math.abs(frame - boundary) <= maxShift
        && frame - current.startFrame >= minFrames
        && following.endFrame - frame >= minFrames,
      );
      if (candidates.length === 0) continue;

      const chosen = candidates.reduce((best, frame) =>
        Math.abs(frame - boundary) < Math.abs(best - boundary) ? frame : best,
      );
      if (chosen === boundary) continue;

      current.endFrame = chosen;
      following.startFrame = chosen;
      shifted++;
    }

    return { scenes: next, shifted };
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

      // Clipping two neighbouring cues to the same scene can bring their edges
      // together even when the source cues did not overlap.
      result.set(scene.id, this.normalizeCueTimeline(sceneSubtitles));
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
        .filter((word) => {
          // Assign each word to exactly one scene by its midpoint, so a word
          // that straddles a boundary is not repeated in both captions.
          const midpoint = (word.startMs + word.endMs) / 2;
          return midpoint >= startMs && midpoint < endMs;
        })
        .map((word) => ({
          ...word,
          startMs: Math.max(word.startMs, startMs),
          endMs: Math.min(word.endMs, endMs),
        }))
        .filter((word) => word.endMs > word.startMs);
      if (keptWords.length === 1 && words.length >= 5) return null;
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

  /**
   * Split a cue without word timings by estimated word midpoints. Each word is
   * assigned to exactly one scene, so a boundary cue cannot be duplicated whole
   * in both scenes. A very short sliver may have no word midpoint; it is dropped
   * rather than repeating the neighbouring scene's text.
   */
  private textForWindow(cue: SubtitleEntry, startMs: number, endMs: number): string {
    const words = cue.text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '';

    const duration = Math.max(1, cue.endMs - cue.startMs);
    const wordDuration = duration / words.length;
    const kept = words.filter((_, index) => {
      const midpoint = cue.startMs + (index + 0.5) * wordDuration;
      return midpoint >= startMs && midpoint < endMs;
    });

    // A one-word sliver is a flash, not a caption. When the rest of the cue is
    // substantial, leave that word to the neighbouring scene instead of
    // flashing it for a few frames.
    if (kept.length === 1 && words.length >= 5) return '';
    return kept.join(' ');
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
      .split(/(?<=[.!?।॥])\s+/)
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
