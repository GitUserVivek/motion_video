import { describe, expect, it } from 'vitest';
import type { SceneChild, SceneInstruction, StoryboardPlan } from '@edumotion/shared';
import { validateLayout } from '../services/layout.validation.js';
import { directStoryboard } from '../services/scene.director.js';

/**
 * Regression fixtures for the editorial failures the old technical report
 * passed: repeated narration, a bubble over a process step, collapsed diagrams,
 * truncated headings and an instructor on the closing card. The storyboards are
 * generic; no rule keys off this job's topic.
 */

const WIDTH = 1080;
const HEIGHT = 1920;

function scene(id: string, children: SceneChild[], overrides: Partial<SceneInstruction> = {}): SceneInstruction {
  return {
    id,
    startFrame: 0,
    endFrame: 192,
    component: 'BackgroundScene',
    props: {},
    children,
    ...overrides,
  };
}

function plan(scenes: SceneInstruction[]): StoryboardPlan {
  return {
    jobId: 'editorial-fixture',
    totalFrames: scenes.reduce((max, item) => Math.max(max, item.endFrame), 0),
    fps: 30,
    audioDurationMs: 6400,
    scenes,
  };
}

function subtitle(...texts: string[]): SceneChild {
  return {
    component: 'Subtitle',
    props: {
      entries: texts.map((text, index) => ({
        index,
        startMs: index * 1000,
        endMs: (index + 1) * 1000,
        text,
      })),
    },
  };
}

const caption = 'Have you ever wondered how to figure out the surface area of a cube?';

describe('editorial layout validation', () => {
  it('blocks a title, bubble and caption that say the same sentence', () => {
    const issues = validateLayout(
      plan([
        scene('scene-1', [
          { component: 'AnimatedText', props: { text: caption, top: '10%', fontSize: 44 } },
          { component: 'SpeechBubble', props: { text: caption, top: '66%', left: '50%', width: 820 } },
          subtitle(caption),
        ]),
      ]),
      WIDTH,
      HEIGHT,
    );

    expect(issues.some((issue) => issue.severity === 'blocking' && /repeats/.test(issue.message))).toBe(true);
  });

  it('blocks a speech bubble painted over a process step', () => {
    const issues = validateLayout(
      plan([
        scene('scene-3', [
          {
            component: 'ProcessFlow',
            props: {
              top: '54%',
              left: '50%',
              stepSpacing: 96,
              steps: [{ label: 'Base' }, { label: 'Sides' }, { label: 'Top' }],
            },
          },
          {
            component: 'SpeechBubble',
            props: { text: 'Why does this matter?', top: '66%', left: '50%', width: 820 },
          },
          subtitle('Why does this matter?'),
        ]),
      ]),
      WIDTH,
      HEIGHT,
    );

    expect(
      issues.some(
        (issue) => issue.severity === 'blocking' && /process flow overlaps speech bubble/i.test(issue.message),
      ),
    ).toBe(true);
  });

  it('blocks a truncated title and a dangling connector', () => {
    const issues = validateLayout(
      plan([
        scene('scene-4', [
          { component: 'AnimatedText', props: { text: 'Where faces meet are…', top: '10%' } },
        ]),
        scene('scene-5', [
          { component: 'AnimatedText', props: { text: 'The surface area of the', top: '10%' } },
        ]),
      ]),
      WIDTH,
      HEIGHT,
    );

    expect(issues.some((issue) => issue.severity === 'blocking' && /ellipsis/.test(issue.message))).toBe(true);
    expect(issues.some((issue) => issue.severity === 'blocking' && /dangling connector/.test(issue.message))).toBe(true);
  });

  it('blocks diagram items clustered in one corner of a manual panel', () => {
    const issues = validateLayout(
      plan([
        scene('scene-2', [
          {
            component: 'AnimatedDiagram',
            props: {
              layout: 'manual',
              width: 600,
              height: 400,
              top: '50%',
              left: '50%',
              items: [
                { icon: 'book', label: 'Face', position: { x: 100, y: 150 } },
                { icon: 'book', label: 'Edge', position: { x: 150, y: 160 } },
                { icon: 'book', label: 'Vertex', position: { x: 200, y: 170 } },
              ],
            },
          },
        ]),
      ]),
      WIDTH,
      HEIGHT,
    );

    expect(issues.some((issue) => issue.severity === 'blocking' && /clustered/.test(issue.message))).toBe(true);
  });

  it('never allows the instructor on the final EndScreen scene', () => {
    const issues = validateLayout(
      plan([
        scene('scene-1', [{ component: 'AnimatedText', props: { text: 'Cube vs Pyramid', top: '10%' } }]),
        scene('scene-7', [
          { component: 'EndScreen', props: { title: 'Now You Know' } },
          { component: 'Teacher', props: { appearance: 'emma', top: '78%', left: '50%' } },
        ], { component: 'EndScreen' }),
      ]),
      WIDTH,
      HEIGHT,
    );

    expect(issues.some((issue) => issue.severity === 'blocking' && /final EndScreen/.test(issue.message))).toBe(true);
  });

  it('passes a clean scene and a second topic with no defects', () => {
    const cubeStoryboard = plan([
      scene('scene-1', [
        { component: 'AnimatedText', props: { text: 'Cube vs Pyramid', top: '10%', fontSize: 58 } },
        {
          component: 'ConceptDiagram',
          props: {
            top: '58%',
            left: '50%',
            items: [{ icon: 'calculator', label: 'Cube' }, { icon: 'calculator', label: 'Pyramid' }],
          },
        },
        subtitle('A cube has six square faces, while a pyramid has triangular ones.'),
      ]),
    ]);
    expect(validateLayout(cubeStoryboard, WIDTH, HEIGHT).filter(
      (issue) => issue.severity === 'blocking',
    )).toEqual([]);

    const plantStoryboard = plan([
      scene('scene-1', [
        { component: 'AnimatedText', props: { text: 'How Leaves Make Food', top: '10%', fontSize: 58 } },
        {
          component: 'ProcessFlow',
          props: {
            top: '54%',
            left: '50%',
            stepSpacing: 96,
            steps: [{ label: 'Sunlight' }, { label: 'Water' }, { label: 'Glucose' }],
          },
        },
        subtitle('Leaves use sunlight and water to make glucose.'),
      ]),
    ]);
    expect(validateLayout(plantStoryboard, WIDTH, HEIGHT).filter(
      (issue) => issue.severity === 'blocking',
    )).toEqual([]);
  });
});

describe('scene director text hierarchy', () => {
  function directedScene(children: SceneChild[], overrides: Partial<SceneInstruction> = {}) {
    const result = directStoryboard(
      plan([
        scene('scene-1', children, overrides),
        scene('scene-2', [{ component: 'EndScreen', props: {} }], {
          startFrame: 192,
          endFrame: 384,
          component: 'EndScreen',
        }),
      ]),
      'A short script about surface area.',
      'en-US-female-1',
    );
    return result.storyboard.scenes[0]!;
  }

  it('replaces a cut-off narration title, then removes the duplicate bubble', () => {
    const directed = directedScene([
      { component: 'AnimatedText', props: { text: 'Have you ever wondered how to figure out the…', top: '12%' } },
      { component: 'SpeechBubble', props: { text: caption, top: '62%', left: '50%', width: 820 } },
      { component: 'ImageScene', props: {} },
      subtitle(caption),
    ], { purpose: 'hook', visualBrief: 'Surface area of a cube' });

    const title = directed.children?.find((child) => child.component === 'AnimatedText');
    expect(typeof title?.props['text']).toBe('string');
    expect(title?.props['text']).not.toMatch(/…$/);
    expect(directed.children?.some((child) => child.component === 'SpeechBubble')).toBe(false);
  });

  it('removes a title that repeats a later caption cue', () => {
    const directed = directedScene([
      { component: 'AnimatedText', props: { text: 'Oxygen is released as a byproduct', top: '10%' } },
      subtitle(
        'Plants capture sunlight in their leaves.',
        'Oxygen is released as a byproduct.',
      ),
      { component: 'ImageScene', props: {} },
    ]);

    expect(directed.children?.some((child) => child.component === 'AnimatedText')).toBe(false);
  });

  it('does not add a bubble when a process flow already fills the middle lane', () => {
    const directed = directedScene([
      { component: 'AnimatedText', props: { text: 'Why does this matter?' } },
      {
        component: 'ProcessFlow',
        props: { steps: [{ label: 'First' }, { label: 'Then' }, { label: 'Finally' }] },
      },
      subtitle('Why does this matter?'),
    ], { purpose: 'process' });

    expect(directed.children?.some((child) => child.component === 'SpeechBubble')).toBe(false);
    expect(directed.children?.some((child) => child.component === 'ProcessFlow')).toBe(true);
  });

  it('keeps a measured-value counter instead of replacing it with a second chart', () => {
    const directed = directedScene([
      {
        component: 'AnimatedNumber',
        props: { target: 30, suffix: '%', top: '33%', left: '50%' },
      },
      subtitle('Demand grew 30% in 2020 and 45% in 2021.'),
    ], { purpose: 'data' });

    expect(directed.children?.some((child) => child.component === 'AnimatedNumber')).toBe(true);
    expect(directed.children?.some((child) => child.component === 'ComparisonChart')).toBe(false);
  });

  /** Every string a component would paint, however deeply it is nested. */
  function paintedText(value: unknown, found: string[] = []): string[] {
    if (typeof value === 'string') found.push(value);
    else if (Array.isArray(value)) value.forEach((item) => paintedText(item, found));
    else if (value && typeof value === 'object') {
      Object.values(value).forEach((item) => paintedText(item, found));
    }
    return found;
  }

  it('never shows an ellipsis in text a viewer reads', () => {
    const narrations = [
      'Do you know why the sky is blue in the day and turns red at sunset?',
      'First the plant absorbs sunlight through its leaves, then it turns water into sugar, and finally it releases oxygen into the air.',
      'Surface area grew from 12% in 2020 to 45% in 2021, while volume stayed flat at 3% in both years.',
      'The cube is called a polyhedron because every face is a flat square, and every edge joins two faces.',
    ];

    for (const narration of narrations) {
      for (const purpose of ['hook', 'process', 'summary', 'definition', 'data']) {
        const directed = directedScene(
          [{ component: 'EducationalObject', props: { type: 'book' } }, subtitle(narration)],
          { purpose },
        );

        const clipped = paintedText(directed.children ?? []).filter((text) =>
          /…$|\.\.\.$/.test(text.trim()),
        );
        expect({ purpose, clipped }).toEqual({ purpose, clipped: [] });
      }
    }
  });

  it('does not stack a deterministic composition on top of another primary visual', () => {
    const directed = directedScene([
      {
        component: 'AnnotatedCallout',
        props: { subject: 'cube', points: [{ label: 'Face', x: 40, y: 40 }] },
      },
      subtitle('First the base, then the sides, finally the top.'),
    ], { purpose: 'process' });

    const primaries = (directed.children ?? []).filter((child) => [
      'AnnotatedCallout', 'ProcessFlow', 'ConceptDiagram', 'AnimatedDiagram',
      'ComparisonChart', 'SummaryScene', 'Timeline', 'SplitScreenComparison',
    ].includes(child.component));

    expect(primaries.length).toBe(1);
  });
});
