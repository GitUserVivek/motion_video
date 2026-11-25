import type { StoryboardPlan, SubtitleEntry } from '@edumotion/shared';

/**
 * The current 3D-shapes narration, re-cut for the editorial paper system.
 *
 * Scene boundaries follow sentence/beat boundaries in the existing audio, so
 * captions and visuals stay in sync without regenerating the voice track.
 */

function wordsFor(text: string, startMs: number, endMs: number): NonNullable<SubtitleEntry['words']> {
  const words = text.split(/\s+/).filter(Boolean);
  const span = Math.max(1, endMs - startMs);
  return words.map((word, index) => ({
    text: word,
    startMs: Math.round(startMs + (span * index) / words.length),
    endMs: Math.round(startMs + (span * (index + 1)) / words.length),
  }));
}

function cue(index: number, text: string, startMs: number, endMs: number): SubtitleEntry {
  return {
    index,
    startMs,
    endMs,
    text,
    words: wordsFor(text, startMs, endMs),
  };
}

const SCENE_1 = [
  cue(0, 'Have you ever wondered how to figure out the parts of a 3D shape?', 0, 4212),
  cue(1, 'Today, we’ll learn how to spot', 4212, 6400),
  cue(2, 'faces, edges, and vertices like a geometry pro.', 6400, 9675),
];

const SCENE_2 = [
  cue(3, 'Imagine a cube—its flat sides are faces,', 9675, 12800),
  cue(4, 'the lines where they meet are edges, and the corners are vertices.', 12800, 15987),
];

const SCENE_3 = [
  cue(5, 'Why does this matter?', 15987, 17987),
  cue(6, 'Because understanding', 17987, 19200),
  cue(7, 'these parts helps us describe shapes accurately.', 19200, 22412),
];

const SCENE_4 = [
  cue(8, 'For example, a pyramid has triangular faces and', 22412, 25600),
  cue(9, 'a square base, with edges connecting them.', 25600, 28462),
];

const SCENE_5 = [
  cue(10, 'Try counting the corners first—they’re where edges meet, and each', 28462, 32000),
  cue(11, 'corner is a vertex.', 32000, 33550),
];

const SCENE_6 = [
  cue(12, 'This skill helps in design, architecture, and even video games!', 33550, 38400),
];

const SCENE_7 = [
  cue(13, 'So next time you see a 3D object, break it down: faces, edges, and vertices—just like a puzzle!', 38400, 44725),
];

export const CURRENT_VIDEO_STORYBOARD: StoryboardPlan = {
  jobId: 'current-3d-shapes-editorial',
  totalFrames: 1344,
  fps: 30,
  audioDurationMs: 44784,
  topic: '3D shapes: faces, edges and vertices',
  domain: 'geometry',
  timingMode: 'scene-relative',
  scenes: [
    {
      id: 'hook',
      startFrame: 0,
      endFrame: 290,
      component: 'BackgroundScene',
      props: { palette: 'indigo', tone: 'dark', pattern: 'grid', seed: 1 },
      children: [
        {
          component: 'AnimatedText',
          props: {
            text: 'Geometry / Lesson 01',
            variant: 'label',
            accent: '#FFB703',
            fontSize: 74,
            top: '7%',
            startFrame: 3,
          },
        },
        {
          component: 'AnimatedText',
          props: {
            text: 'Every 3D shape has three parts.',
            fontSize: 96,
            color: '#FFFDF6',
            top: '18%',
            startFrame: 5,
          },
        },
        {
          component: 'AnimatedDiagram',
          props: {
            title: 'THE PARTS',
            items: [
              { icon: 'square', label: 'Faces', description: 'flat surfaces', position: { x: 0, y: 0 } },
              { icon: 'edge', label: 'Edges', description: 'where faces meet', position: { x: 0, y: 0 } },
              { icon: 'vertex', label: 'Vertices', description: 'the corners', position: { x: 0, y: 0 } },
            ],
            top: '62%',
            width: 860,
            iconSize: 140,
            startFrame: 14,
          },
        },
        {
          component: 'Subtitle',
          props: { entries: SCENE_1 },
        },
      ],
    },
    {
      id: 'faces',
      startFrame: 290,
      endFrame: 557,
      component: 'BackgroundScene',
      props: { palette: 'sunshine', pattern: 'grid', seed: 2 },
      children: [
        {
          component: 'AnimatedText',
          props: {
            text: '01 / Faces',
            variant: 'label',
            accent: '#FF5A1F',
            fontSize: 68,
            top: '7%',
            startFrame: 2,
          },
        },
        {
          component: 'AnimatedText',
          props: {
            text: 'Flat surfaces.',
            fontSize: 94,
            top: '15%',
            startFrame: 5,
          },
        },
        {
          component: 'AnimatedNumber',
          props: {
            target: 6,
            fontSize: 330,
            color: '#FF5A1F',
            top: '40%',
            startFrame: 10,
            duration: 28,
          },
        },
        {
          component: 'AnimatedDiagram',
          props: {
            title: 'A CUBE',
            items: [
              { icon: 'cube', label: '6 Faces', description: 'six flat square sides', position: { x: 0, y: 0 } },
            ],
            top: '62%',
            width: 700,
            iconSize: 240,
            startFrame: 15,
          },
        },
        {
          component: 'Subtitle',
          props: { entries: SCENE_2 },
        },
      ],
    },
    {
      id: 'why-it-matters',
      startFrame: 557,
      endFrame: 672,
      component: 'BackgroundScene',
      props: { palette: 'coral', pattern: 'grid', seed: 3 },
      children: [
        {
          component: 'AnimatedText',
          props: {
            text: 'Why it matters',
            variant: 'label',
            accent: '#FFB703',
            fontSize: 66,
            top: '7%',
            startFrame: 2,
          },
        },
        {
          component: 'AnimatedText',
          props: {
            text: 'Shape language.',
            fontSize: 88,
            top: '14%',
            startFrame: 4,
          },
        },
        {
          component: 'AnimatedText',
          props: {
            text: 'Knowing the parts lets us describe any solid.',
            variant: 'body',
            fontSize: 34,
            color: '#3B362C',
            top: '32%',
            width: '80%',
            startFrame: 10,
          },
        },
        {
          component: 'AnimatedDiagram',
          props: {
            equation: '6 FACES + 12 EDGES + 8 VERTICES',
            top: '45%',
            width: 900,
            startFrame: 12,
          },
        },
        {
          component: 'AnimatedDiagram',
          props: {
            items: [
              { icon: 'square', label: 'Faces', description: 'flat surfaces', position: { x: 0, y: 0 } },
              { icon: 'edge', label: 'Edges', description: 'where faces meet', position: { x: 0, y: 0 } },
              { icon: 'vertex', label: 'Vertices', description: 'the corners', position: { x: 0, y: 0 } },
            ],
            top: '62%',
            width: 900,
            iconSize: 112,
            startFrame: 18,
          },
        },
        {
          component: 'Subtitle',
          props: { entries: SCENE_3 },
        },
      ],
    },
    {
      id: 'compare',
      startFrame: 672,
      endFrame: 863,
      component: 'BackgroundScene',
      props: { palette: 'sky', pattern: 'grid', seed: 4 },
      children: [
        {
          component: 'AnimatedText',
          props: {
            text: 'Cube vs pyramid',
            variant: 'label',
            accent: '#FF5A1F',
            fontSize: 64,
            top: '7%',
            startFrame: 2,
          },
        },
        {
          component: 'AnimatedText',
          props: {
            text: 'Count the parts.',
            fontSize: 92,
            top: '14%',
            startFrame: 4,
          },
        },
        {
          component: 'SplitScreenComparison',
          props: {
            left: {
              content: 'Cube: 6 faces, 12 edges, 8 vertices',
              label: 'SIX SQUARE SIDES',
              color: '#2F6BFF',
            },
            right: {
              content: 'Pyramid: 5 faces, 8 edges, 5 vertices',
              label: 'SQUARE BASE + TRIANGLES',
              color: '#FFB703',
            },
            comparisonLabel: 'vs',
            startFrame: 10,
          },
        },
        {
          component: 'Subtitle',
          props: { entries: SCENE_4 },
        },
      ],
    },
    {
      id: 'count-corners',
      startFrame: 863,
      endFrame: 1007,
      component: 'BackgroundScene',
      props: { palette: 'mint', pattern: 'grid', seed: 5 },
      children: [
        {
          component: 'AnimatedText',
          props: {
            text: 'Count the corners',
            variant: 'label',
            accent: '#2F6BFF',
            fontSize: 62,
            top: '7%',
            startFrame: 2,
          },
        },
        {
          component: 'AnimatedText',
          props: {
            text: 'Every corner is a vertex.',
            fontSize: 86,
            top: '14%',
            startFrame: 4,
          },
        },
        {
          component: 'ProcessFlow',
          props: {
            direction: 'vertical',
            startFrame: 10,
            top: '58%',
            steps: [
              { label: 'Find a corner', description: 'where two edges meet' },
              { label: 'Count it once', description: 'each corner is one vertex' },
              { label: 'Cube 8 · Pyramid 5', description: 'vertices in each solid' },
            ],
          },
        },
        {
          component: 'Subtitle',
          props: { entries: SCENE_5 },
        },
      ],
    },
    {
      id: 'real-world',
      startFrame: 1007,
      endFrame: 1152,
      component: 'BackgroundScene',
      props: { palette: 'violet', pattern: 'grid', seed: 6 },
      children: [
        {
          component: 'AnimatedText',
          props: {
            text: 'Real world',
            variant: 'label',
            accent: '#FFB703',
            fontSize: 66,
            top: '7%',
            startFrame: 2,
          },
        },
        {
          component: 'AnimatedText',
          props: {
            text: 'Design. Build. Play.',
            fontSize: 88,
            top: '14%',
            startFrame: 4,
          },
        },
        {
          component: 'ProcessFlow',
          props: {
            direction: 'vertical',
            startFrame: 10,
            top: '50%',
            steps: [
              { label: 'Architecture', description: 'floor plans and facades' },
              { label: 'Product design', description: 'parts that fit together' },
              { label: 'Video games', description: '3D worlds and collisions' },
            ],
          },
        },
        {
          component: 'Subtitle',
          props: { entries: SCENE_6 },
        },
      ],
    },
    {
      id: 'recap',
      startFrame: 1152,
      endFrame: 1344,
      component: 'BackgroundScene',
      props: { palette: 'sunshine', pattern: 'grid', seed: 7 },
      children: [
        {
          component: 'EndScreen',
          props: {
            kicker: 'Recap',
            title: 'Break it down',
            subtitle: 'Faces, edges, and vertices — just like a puzzle.',
            chips: ['Faces 6', 'Edges 12', 'Vertices 8'],
            logoText: 'EduMotion',
            startFrame: 4,
          },
        },
        {
          component: 'Subtitle',
          props: { entries: SCENE_7 },
        },
      ],
    },
  ],
};
