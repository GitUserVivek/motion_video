import { describe, expect, it } from 'vitest';
import type { StoryboardPlan } from '@edumotion/shared';
import { validateLayout } from '../services/layout.validation.js';
import { validateSubtitles } from '../services/subtitle.validation.js';
import { storyboardValidator } from '../services/storyboard.validation.js';

function storyboard(children: StoryboardPlan['scenes'][number]['children']): StoryboardPlan {
  return {
    jobId: 'job-1',
    totalFrames: 100,
    fps: 30,
    audioDurationMs: 3000,
    scenes: [{
      id: 'scene-1',
      startFrame: 0,
      endFrame: 100,
      component: 'BackgroundScene',
      props: {},
      children,
    }],
  };
}

describe('validateLayout', () => {
  it('blocks a title that cannot fit the safe area', () => {
    const issues = validateLayout(
      storyboard([{
        component: 'AnimatedText',
        props: { text: 'A'.repeat(180), fontSize: 60, top: '10%' },
      }]),
      1080,
      1920,
    );
    expect(issues.some((issue) => issue.severity === 'blocking')).toBe(true);
  });

  it('accepts a short title in the safe band', () => {
    const issues = validateLayout(
      storyboard([{
        component: 'AnimatedText',
        props: { text: 'Profit or Loss?', fontSize: 60, top: '10%' },
      }]),
      1080,
      1920,
    );
    expect(issues).toEqual([]);
  });
});

describe('storyboardValidator visual relevance', () => {
  it('counts the verified concepts carried by attached artwork', () => {
    const caption = 'Neurons pass messages between layers.';
    const sb = storyboard([
      { component: 'Subtitle', props: { entries: [{ index: 0, startMs: 0, endMs: 3000, text: caption }] } },
      { component: 'AnimatedText', props: { text: 'How neurons work' } },
      {
        component: 'ProcessFlow',
        props: {
          steps: [
            { label: 'Step one', imageAlt: 'input data' },
            { label: 'Step two', imageAlt: 'neuron message passing' },
            { label: 'Step three', imageAlt: 'output prediction' },
          ],
        },
      },
    ]);

    const result = storyboardValidator.validate(sb, caption);
    expect(result.sceneResults[0]?.visualRelevance).toBeGreaterThanOrEqual(0.5);
    expect(result.sceneResults[0]?.issues.join(' ')).not.toMatch(/Low visual relevance/);
  });
});

describe('validateSubtitles', () => {
  it('blocks the same caption appearing in two scenes', () => {
    const shared = { index: 0, startMs: 0, endMs: 500, text: 'Same caption' };
    const sb: StoryboardPlan = {
      jobId: 'job-1',
      totalFrames: 200,
      fps: 30,
      audioDurationMs: 6000,
      scenes: [
        {
          id: 'scene-1', startFrame: 0, endFrame: 100,
          component: 'BackgroundScene', props: {},
          children: [{ component: 'Subtitle', props: { entries: [shared] } }],
        },
        {
          id: 'scene-2', startFrame: 100, endFrame: 200,
          component: 'BackgroundScene', props: {},
          children: [{ component: 'Subtitle', props: { entries: [shared] } }],
        },
      ],
    };

    expect(validateSubtitles(sb, 6000)).toEqual([
      expect.objectContaining({ severity: 'blocking' }),
    ]);
  });
});
