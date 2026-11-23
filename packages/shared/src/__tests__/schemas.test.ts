import { describe, it, expect } from 'vitest';
import {
  SceneInstructionSchema,
  StoryboardPlanSchema,
  GenerateScriptRequestSchema,
  OwnScriptRequestSchema,
  VideoConfigSchema,
  GenerateVideoRequestSchema,
  INSTRUCTOR_PROFILES,
  resolveInstructor,
} from '../index.js';

describe('SceneInstructionSchema', () => {
  it('accepts a valid scene', () => {
    const scene = {
      id: 'scene-1',
      startFrame: 0,
      endFrame: 90,
      component: 'BackgroundScene',
      props: { theme: 'educational' },
      children: [
        { component: 'AnimatedText', props: { text: 'Hello', animation: 'fadeIn' } },
      ],
    };
    expect(SceneInstructionSchema.parse(scene)).toMatchObject({ id: 'scene-1' });
  });

  it('rejects endFrame <= startFrame', () => {
    expect(() =>
      SceneInstructionSchema.parse({
        id: 's', startFrame: 10, endFrame: 10, component: 'BackgroundScene', props: {},
      }),
    ).toThrow();
  });

  it('rejects unknown component name', () => {
    expect(() =>
      SceneInstructionSchema.parse({
        id: 's', startFrame: 0, endFrame: 30, component: 'UnknownWidget', props: {},
      }),
    ).toThrow();
  });
});

describe('StoryboardPlanSchema', () => {
  it('accepts a valid storyboard', () => {
    const sb = {
      jobId: 'job-1',
      totalFrames: 1200,
      fps: 30,
      audioDurationMs: 40000,
      scenes: [
        { id: 'scene-1', startFrame: 0, endFrame: 1200, component: 'BackgroundScene', props: {} },
      ],
    };
    expect(StoryboardPlanSchema.parse(sb)).toMatchObject({ jobId: 'job-1' });
  });

  it('rejects empty scenes array', () => {
    expect(() =>
      StoryboardPlanSchema.parse({
        jobId: 'j', totalFrames: 100, fps: 30, audioDurationMs: 3000, scenes: [],
      }),
    ).toThrow();
  });
});

describe('resolveInstructor', () => {
  it('maps each voice preset to its saved presenter', () => {
    expect(resolveInstructor('en-US-female-1').id).toBe('emma');
    expect(resolveInstructor('en-US-male-1').id).toBe('james');
    expect(resolveInstructor('en-GB-female-1').id).toBe('sophie');
    expect(resolveInstructor('espeak-en').id).toBe('alex');
  });

  it('recognises raw edge-tts voice names and falls back safely', () => {
    expect(resolveInstructor('en-US-GuyNeural').id).toBe('james');
    expect(resolveInstructor('en-GB-SoniaNeural').id).toBe('sophie');
    expect(resolveInstructor(undefined).id).toBe('alex');
  });

  it('returns a complete reusable profile', () => {
    for (const profile of Object.values(INSTRUCTOR_PROFILES)) {
      expect(profile.name.length).toBeGreaterThan(0);
      expect(profile.skin).toMatch(/^#[0-9a-f]{6}$/i);
      expect(profile.blazer).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('GenerateScriptRequestSchema', () => {
  it('accepts valid topic', () => {
    expect(GenerateScriptRequestSchema.parse({ topic: 'Photosynthesis' })).toMatchObject({
      topic: 'Photosynthesis',
    });
  });

  it('rejects topic under 3 chars', () => {
    expect(() => GenerateScriptRequestSchema.parse({ topic: 'AB' })).toThrow();
  });
});

describe('OwnScriptRequestSchema', () => {
  it('accepts valid script with preserve mode', () => {
    const req = { content: 'This is my narration script.', mode: 'preserve' };
    expect(OwnScriptRequestSchema.parse(req)).toMatchObject({ mode: 'preserve' });
  });

  it('rejects content under 10 chars', () => {
    expect(() => OwnScriptRequestSchema.parse({ content: 'Short', mode: 'improve' })).toThrow();
  });

  it('rejects invalid mode', () => {
    expect(() =>
      OwnScriptRequestSchema.parse({ content: 'Valid content here', mode: 'delete' }),
    ).toThrow();
  });
});

describe('VideoConfigSchema', () => {
  it('accepts valid config', () => {
    const cfg = {
      duration: 40, aspectRatio: '9:16', language: 'en', voice: 'en-US-AriaNeural',
      animationTheme: 'educational', subtitles: true, backgroundMusic: false,
      fps: 30, width: 1080, height: 1920,
    };
    expect(VideoConfigSchema.parse(cfg)).toMatchObject({ duration: 40 });
  });

  it('rejects invalid aspect ratio', () => {
    expect(() =>
      VideoConfigSchema.parse({
        duration: 40, aspectRatio: '4:3', language: 'en', voice: 'v',
        animationTheme: 'educational', subtitles: true, backgroundMusic: false,
        fps: 30, width: 1080, height: 1920,
      }),
    ).toThrow();
  });
});
