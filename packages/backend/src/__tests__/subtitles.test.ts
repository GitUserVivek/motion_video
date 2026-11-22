import { describe, expect, it } from 'vitest';
import type { SubtitleEntry } from '@edumotion/shared';
import { subtitleService } from '../services/subtitle.service.js';

const scenes = [
  { id: 'scene-1', startFrame: 0, endFrame: 30, fps: 30 },
  { id: 'scene-2', startFrame: 30, endFrame: 60, fps: 30 },
  { id: 'scene-3', startFrame: 60, endFrame: 90, fps: 30 },
];

describe('subtitleService.alignToScenes', () => {
  it('splits a cue that crosses a scene boundary instead of duplicating it', () => {
    const cues: SubtitleEntry[] = [
      { index: 0, startMs: 900, endMs: 2100, text: 'one two three four five six' },
    ];

    const aligned = subtitleService.alignToScenes(cues, scenes);
    const first = aligned.get('scene-1') ?? [];
    const second = aligned.get('scene-2') ?? [];
    const third = aligned.get('scene-3') ?? [];

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(third).toHaveLength(1);
    expect(first[0]?.endMs).toBe(1000);
    expect(second[0]?.startMs).toBe(1000);
    expect(second[0]?.endMs).toBe(2000);
    expect(third[0]?.startMs).toBe(2000);
    expect(first[0]?.text).not.toBe(second[0]?.text);
    expect([...first, ...second, ...third].map((cue) => cue.text).join(' ')).toContain('one');
  });

  it('keeps word timings inside the scene window', () => {
    const cues: SubtitleEntry[] = [
      {
        index: 0,
        startMs: 800,
        endMs: 2200,
        text: 'alpha beta gamma delta',
        words: [
          { text: 'alpha', startMs: 800, endMs: 1100 },
          { text: 'beta', startMs: 1100, endMs: 1400 },
          { text: 'gamma', startMs: 1400, endMs: 1800 },
          { text: 'delta', startMs: 1800, endMs: 2200 },
        ],
      },
    ];

    const aligned = subtitleService.alignToScenes(cues, scenes);
    const first = aligned.get('scene-1')?.[0];
    const second = aligned.get('scene-2')?.[0];

    expect(first?.words?.map((word) => word.text)).toEqual(['alpha']);
    expect(second?.words?.map((word) => word.text)).toEqual(['beta', 'gamma']);
    expect(first?.words?.[0]?.endMs).toBeLessThanOrEqual(1000);
  });

  it('leaves a cue wholly inside one scene untouched', () => {
    const cue: SubtitleEntry = { index: 0, startMs: 1200, endMs: 1800, text: 'inside' };
    const aligned = subtitleService.alignToScenes([cue], scenes);
    expect(aligned.get('scene-2')).toEqual([cue]);
    expect(aligned.get('scene-1')).toEqual([]);
  });
});
