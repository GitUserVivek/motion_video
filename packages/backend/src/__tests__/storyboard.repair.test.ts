import { describe, expect, it } from 'vitest';
import type { SceneInstruction, StoryboardPlan, SubtitleEntry } from '@edumotion/shared';
import { repairStoryboardProps } from '../services/storyboard.repair.js';
import { splitOversizedScenes } from '../services/scene.balance.js';

function scene(
  id: string,
  startFrame: number,
  endFrame: number,
  children: SceneInstruction['children'] = [],
): SceneInstruction {
  return {
    id,
    startFrame,
    endFrame,
    component: 'BackgroundScene',
    props: { theme: 'educational' },
    children,
  };
}

function plan(scenes: SceneInstruction[]): StoryboardPlan {
  return {
    jobId: 'job-1',
    totalFrames: 1147,
    fps: 30,
    audioDurationMs: 38208,
    scenes,
  };
}

const captions: SubtitleEntry[] = [
  { index: 0, startMs: 12000, endMs: 12987, text: 'this process.' },
  { index: 1, startMs: 12987, endMs: 18525, text: 'Plants take in carbon dioxide and water, using sunlight to create glucose and oxygen.' },
  { index: 2, startMs: 18525, endMs: 23987, text: 'The light-dependent reactions capture energy, while the light-independent ones build sugar.' },
  { index: 3, startMs: 23987, endMs: 28362, text: 'This process fuels ecosystems and sustains all living things.' },
  { index: 4, startMs: 28362, endMs: 33312, text: 'Understanding photosynthesis helps us appreciate how plants sustain life.' },
  { index: 5, startMs: 33312, endMs: 38137, text: 'So next time you see a tree, remember it is a powerhouse of nature.' },
];

describe('repairStoryboardProps', () => {
  it('converts legacy SplitScreenComparison titles into left/right content', () => {
    const repaired = repairStoryboardProps(plan([
      scene('scene-1', 0, 120, [{
        component: 'SplitScreenComparison',
        props: { leftTitle: 'Solar Panel', rightTitle: 'Plant Leaf' },
      }]),
    ])).storyboard;

    const props = repaired.scenes[0]?.children?.[0]?.props;
    expect(props?.['left']).toEqual({ content: 'Solar Panel' });
    expect(props?.['right']).toEqual({ content: 'Plant Leaf' });
  });

  it('repairs string ProcessFlow steps and equation-only AnimatedDiagram props', () => {
    const repaired = repairStoryboardProps(plan([
      scene('scene-1', 0, 120, [
        { component: 'ProcessFlow', props: { steps: ['sunlight enters', 'chlorophyll absorbs'] } },
        { component: 'AnimatedDiagram', props: { equation: 'CO2 + H2O -> glucose + O2' } },
      ]),
    ])).storyboard;

    const children = repaired.scenes[0]?.children ?? [];
    const flow = children.find((child) => child.component === 'ProcessFlow');
    const diagram = children.find((child) => child.component === 'AnimatedDiagram');
    expect(flow?.props['steps']).toEqual([
      { label: 'sunlight enters' },
      { label: 'chlorophyll absorbs' },
    ]);
    expect(flow?.props['direction']).toBe('horizontal');
    expect(diagram?.props['equation']).toBe('CO2 + H2O -> glucose + O2');
    expect(diagram?.props['items']).toEqual([]);
  });

  it('maps EndScreen text to its title', () => {
    const repaired = repairStoryboardProps(plan([
      scene('scene-1', 0, 120, [{
        component: 'EndScreen',
        props: { text: 'Photosynthesis powers life on Earth' },
      }]),
    ])).storyboard;

    expect(repaired.scenes[0]?.children?.[0]?.props['title']).toBe(
      'Photosynthesis powers life on Earth',
    );
  });
});

describe('splitOversizedScenes', () => {
  it('splits a 26-second closing scene at caption boundaries and keeps one EndScreen', () => {
    const original = plan([
      scene('scene-1', 0, 120, [{ component: 'Subtitle', props: { entries: [] } }]),
      scene('scene-2', 120, 240, [{ component: 'Subtitle', props: { entries: [] } }]),
      scene('scene-3', 240, 360, [{ component: 'Subtitle', props: { entries: [] } }]),
      scene('scene-4', 360, 1147, [
        { component: 'EndScreen', props: { title: 'Photosynthesis powers life on Earth' } },
        { component: 'Subtitle', props: { entries: [] } },
      ]),
    ]);

    const { storyboard, splitScenes, addedScenes } = splitOversizedScenes(original, captions);

    expect(splitScenes).toBe(1);
    expect(addedScenes).toBeGreaterThan(0);
    expect(storyboard.scenes.length).toBeGreaterThan(4);
    expect(storyboard.scenes.every((item) => item.endFrame - item.startFrame <= 240)).toBe(true);
    expect(storyboard.scenes[0]?.startFrame).toBe(0);
    expect(storyboard.scenes.at(-1)?.endFrame).toBe(1147);
    expect(storyboard.scenes.at(-1)?.children?.some((child) => child.component === 'EndScreen'))
      .toBe(true);

    for (let i = 1; i < storyboard.scenes.length; i++) {
      expect(storyboard.scenes[i]?.startFrame).toBe(storyboard.scenes[i - 1]?.endFrame);
    }
  });

  it('prefers a spoken sentence boundary over a phrase boundary', () => {
    const sentenceCues: SubtitleEntry[] = [
      { index: 0, startMs: 0, endMs: 3000, text: 'Today we learn about shapes.' },
      { index: 1, startMs: 3000, endMs: 6500, text: 'A face is the flat side,' },
      { index: 2, startMs: 6500, endMs: 9000, text: 'and an edge is where two faces meet.' },
      { index: 3, startMs: 9000, endMs: 12000, text: 'Every vertex is a corner.' },
      { index: 4, startMs: 12000, endMs: 15000, text: 'Three edges meet at each one.' },
    ];

    const { storyboard, splitScenes } = splitOversizedScenes(
      plan([scene('scene-1', 0, 450)]),
      sentenceCues,
    );

    expect(splitScenes).toBe(1);
    expect(storyboard.scenes.length).toBe(3);

    // Every boundary is the end of a spoken sentence (3000 ms = frame 90,
    // 9000 ms = frame 270), not the 8000 ms budget cutting through one.
    const boundaries = storyboard.scenes.slice(0, -1).map((item) => item.endFrame);
    expect(boundaries).toEqual([90, 270]);
    for (const boundary of boundaries) {
      const cueAtBoundary = sentenceCues.find((cue) => Math.round((cue.endMs / 1000) * 30) === boundary);
      expect(cueAtBoundary?.text.trim()).toMatch(/[.!?]$/);
    }
    for (const next of storyboard.scenes.slice(1)) {
      expect((next.visualBrief ?? '').trim()).not.toMatch(
        /^(and|but|so|because|which|while|that)\b/i,
      );
    }
  });
});
