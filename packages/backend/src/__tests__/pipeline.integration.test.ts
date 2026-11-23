import fs from 'fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SubtitleEntry, VideoConfig } from '@edumotion/shared';
import { storyboardService } from '../services/storyboard.service.js';
import { ollamaService } from '../services/ollama.service.js';
import { deriveContentAnalysis } from '../services/content.analysis.js';
import { jobFiles } from '../services/job.files.js';
import { validateTiming } from '../services/timing.service.js';
import { validateSubtitles } from '../services/subtitle.validation.js';
import { validateLayout } from '../services/layout.validation.js';
import { validateVideo } from '../services/content.validation.js';

/**
 * A fake model + fake measured-TTS run through the real planner.
 *
 * This is the seam the unit tests do not cover: schema parsing, prop repair,
 * caption boundary splitting, scene direction, timing normalisation and the
 * artifact writes all have to agree on the final Remotion props.
 */

const JOB_ID = 'integration-fixture';

const script = [
  'Profit and loss are the two possible results of running a business.',
  'A profit means revenue is higher than costs.',
  'A loss means costs are higher than revenue.',
  'The owner compares both numbers before deciding what to do next.',
].join('\n');

const config: VideoConfig = {
  duration: 12,
  aspectRatio: '9:16',
  language: 'en',
  voice: 'en-US-female-1',
  animationTheme: 'educational',
  subtitles: true,
  backgroundMusic: false,
  fps: 30,
  width: 1080,
  height: 1920,
};

function measuredCue(
  index: number,
  startMs: number,
  endMs: number,
  text: string,
): SubtitleEntry {
  const parts = text.split(/\s+/);
  const duration = (endMs - startMs) / parts.length;
  return {
    index,
    startMs,
    endMs,
    text,
    words: parts.map((word, wordIndex) => ({
      text: word,
      startMs: Math.round(startMs + wordIndex * duration),
      endMs: Math.round(startMs + (wordIndex + 1) * duration),
    })),
  };
}

const subtitles: SubtitleEntry[] = [
  measuredCue(0, 0, 3500, 'Profit and loss are the two possible results'),
  measuredCue(1, 3500, 6000, 'A profit means revenue is higher than costs'),
  measuredCue(2, 6000, 7600, 'A loss means costs are higher than revenue'),
  measuredCue(3, 7600, 10500, 'The owner compares both numbers before deciding'),
];

const modelStoryboard = {
  scenes: [
    {
      id: 'scene-1',
      startFrame: 0,
      endFrame: 120,
      purpose: 'define',
      visualBrief: 'Two labelled cards compare profit with loss.',
      keyTerms: ['profit', 'loss'],
      assetQueries: ['profit and loss comparison'],
      animationIntent: 'reveal the profit card, then the loss card',
      transition: 'fade',
      component: 'BackgroundScene',
      props: { theme: 'educational' },
      children: [
        {
          component: 'AnimatedText',
          props: { text: 'Profit or Loss?', fontSize: 58, top: '12%', startFrame: 4 },
        },
        {
          component: 'ConceptDiagram',
          props: {
            accent: '#8f7be0',
            top: '58%',
            startFrame: 8,
            items: [
              { icon: 'chart', label: 'Profit' },
              { icon: 'calculator', label: 'Loss' },
            ],
          },
        },
      ],
    },
    {
      id: 'scene-2',
      startFrame: 120,
      endFrame: 240,
      purpose: 'process',
      visualBrief: 'Revenue and costs are compared before the result is decided.',
      keyTerms: ['revenue', 'costs'],
      assetQueries: ['revenue versus costs'],
      animationIntent: 'show revenue, then costs, then the result',
      transition: 'slide',
      component: 'BackgroundScene',
      props: { theme: 'educational' },
      children: [
        {
          component: 'AnimatedText',
          props: { text: 'Revenue and Costs', fontSize: 58, top: '12%', startFrame: 4 },
        },
        {
          component: 'ConceptDiagram',
          props: {
            accent: '#8f7be0',
            top: '60%',
            startFrame: 8,
            items: [
              { icon: 'chart', label: 'Revenue' },
              { icon: 'calculator', label: 'Costs' },
            ],
          },
        },
      ],
    },
    {
      id: 'scene-3',
      startFrame: 240,
      endFrame: 360,
      purpose: 'ending',
      visualBrief: 'Closing recap card.',
      keyTerms: ['profit', 'loss'],
      assetQueries: [],
      animationIntent: 'settle the closing card',
      transition: 'fade',
      component: 'BackgroundScene',
      props: { theme: 'educational' },
      children: [
        {
          component: 'EndScreen',
          props: { title: 'Profit, Loss, and the Decision', subtitle: 'Compare before you decide.' },
        },
      ],
    },
  ],
};

describe('storyboard pipeline integration fixture', () => {
  const chat = vi.spyOn(ollamaService, 'chat');

  beforeAll(() => {
    fs.rmSync(jobFiles.dir(JOB_ID), { recursive: true, force: true });
    chat.mockResolvedValue(JSON.stringify(modelStoryboard));
  });

  afterAll(() => {
    chat.mockRestore();
    fs.rmSync(jobFiles.dir(JOB_ID), { recursive: true, force: true });
  });

  it('produces final render props with relative timings, split captions and reports', async () => {
    const analysis = deriveContentAnalysis({ script });
    const result = await storyboardService.planStoryboard(
      JOB_ID,
      script,
      config,
      12_000,
      subtitles,
      analysis,
    );

    expect(result.storyboard.timingMode).toBe('scene-relative');
    expect(validateTiming(result.storyboard)).toEqual([]);

    for (const scene of result.storyboard.scenes) {
      const duration = scene.endFrame - scene.startFrame;
      for (const child of scene.children ?? []) {
        const start = child.props['startFrame'];
        expect(typeof start).toBe('number');
        expect(start as number).toBeGreaterThanOrEqual(0);
        expect(start as number).toBeLessThan(duration);
      }
    }

    const captions = result.storyboard.scenes.flatMap((scene) =>
      (scene.children ?? [])
        .filter((child) => child.component === 'Subtitle')
        .flatMap((child) => (child.props['entries'] as SubtitleEntry[] | undefined) ?? []),
    );
    expect(captions.length).toBeGreaterThan(0);
    expect(new Set(captions.map((cue) => cue.text)).size).toBe(captions.length);
    expect(validateSubtitles(result.storyboard, 12_000)).toEqual([]);

    const firstScene = result.storyboard.scenes[0];
    const secondScene = result.storyboard.scenes[1];
    const firstCaptionText = firstScene?.children
      ?.find((child) => child.component === 'Subtitle')
      ?.props['entries'] as SubtitleEntry[] | undefined;
    const secondCaptionText = secondScene?.children
      ?.find((child) => child.component === 'Subtitle')
      ?.props['entries'] as SubtitleEntry[] | undefined;
    expect(firstCaptionText?.map((cue) => cue.text).join(' ')).toBeTruthy();
    expect(secondCaptionText?.map((cue) => cue.text).join(' ')).toBeTruthy();

    expect(validateLayout(result.storyboard, config.width, config.height).filter(
      (issue) => issue.severity === 'blocking',
    )).toEqual([]);

    const report = validateVideo({
      storyboard: result.storyboard,
      script,
      analysis,
      config,
      audioDurationMs: 12_000,
    });
    expect(report.blocking).toEqual([]);

    expect(Array.isArray(result.assetUses)).toBe(true);
    for (const asset of result.assetUses) {
      expect(asset.sceneIndex).toBeGreaterThanOrEqual(0);
      expect(asset.label.length).toBeGreaterThan(0);
      expect(['downloaded', 'library', 'builtin']).toContain(asset.source);
    }

    expect(fs.existsSync(jobFiles.storyboard(JOB_ID))).toBe(true);
    expect(fs.existsSync(jobFiles.timingReport(JOB_ID))).toBe(true);
    expect(fs.existsSync(jobFiles.llmStoryboard(JOB_ID))).toBe(true);

    const timingReport = JSON.parse(fs.readFileSync(jobFiles.timingReport(JOB_ID), 'utf-8')) as {
      timingMode?: string;
      entries?: Array<{ absoluteStart?: number }>;
    };
    expect(timingReport.timingMode).toBe('scene-relative');
    expect(timingReport.entries?.some((entry) => (entry.absoluteStart ?? 0) > 0)).toBe(true);
  }, 20_000);
});
