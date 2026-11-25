import { describe, expect, it } from 'vitest';
import type { StoryboardPlan } from '@edumotion/shared';
import {
  ensureEndScreenDuration,
  normalizeStoryboardTiming,
  validateTiming,
} from '../services/timing.service.js';

function plan(overrides: Partial<StoryboardPlan> = {}): StoryboardPlan {
  return {
    jobId: 'job-1',
    totalFrames: 900,
    fps: 30,
    audioDurationMs: 30_000,
    scenes: [
      {
        id: 'scene-1',
        startFrame: 0,
        endFrame: 300,
        component: 'BackgroundScene',
        props: {},
        children: [
          { component: 'AnimatedText', props: { text: 'One', startFrame: 4 } },
        ],
      },
      {
        id: 'scene-2',
        startFrame: 300,
        endFrame: 600,
        component: 'BackgroundScene',
        props: {},
        children: [
          { component: 'AnimatedText', props: { text: 'Two', startFrame: 10 } },
        ],
      },
      {
        id: 'scene-3',
        startFrame: 600,
        endFrame: 900,
        component: 'BackgroundScene',
        props: {},
        children: [
          { component: 'AnimatedText', props: { text: 'Three', startFrame: 6 } },
        ],
      },
    ],
    ...overrides,
  };
}

describe('ensureEndScreenDuration', () => {
  it('lengthens a very short closing card by borrowing from the previous scene', () => {
    const short = plan();
    const last = short.scenes[2];
    const previous = short.scenes[1];
    if (last) {
      last.startFrame = 862;
      last.children = [{ component: 'EndScreen', props: {} }];
    }
    if (previous) previous.endFrame = 862;

    const { storyboard, extendedFrames } = ensureEndScreenDuration(short, 75);
    const closing = storyboard.scenes.at(-1);
    expect(extendedFrames).toBe(75 - 38);
    expect(closing?.endFrame).toBe(900);
    expect((closing?.endFrame ?? 0) - (closing?.startFrame ?? 0)).toBe(75);
    expect(storyboard.scenes[1]?.endFrame).toBe(closing?.startFrame);
  });
});

describe('normalizeStoryboardTiming', () => {
  it('keeps scene-relative values and computes the absolute frame', () => {
    const { storyboard, report } = normalizeStoryboardTiming(plan({ timingMode: 'scene-relative' }));
    const second = storyboard.scenes[1];

    expect(second?.children?.[0]?.props['startFrame']).toBe(10);
    expect(report.entries.find((entry) => entry.sceneId === 'scene-2')?.absoluteStart).toBe(310);
    expect(report.repaired).toBe(0);
  });

  it('rebases a legacy absolute child frame once', () => {
    const legacy = plan();
    const second = legacy.scenes[1];
    if (second?.children?.[0]) second.children[0].props['startFrame'] = 310;

    const { storyboard, report } = normalizeStoryboardTiming(legacy);
    expect(storyboard.scenes[1]?.children?.[0]?.props['startFrame']).toBe(10);
    expect(report.entries.find((entry) => entry.sceneId === 'scene-2')?.action).toBe('rebased');
  });

  it('clamps a child that would start outside its scene', () => {
    const outOfBounds = plan({ timingMode: 'scene-relative' });
    const first = outOfBounds.scenes[0];
    if (first?.children?.[0]) first.children[0].props['startFrame'] = 999;

    const { storyboard } = normalizeStoryboardTiming(outOfBounds);
    expect(storyboard.scenes[0]?.children?.[0]?.props['startFrame']).toBe(295);
  });

  it('validates the normalised contract', () => {
    const { storyboard } = normalizeStoryboardTiming(plan({ timingMode: 'scene-relative' }));
    expect(validateTiming(storyboard)).toEqual([]);
  });
});
