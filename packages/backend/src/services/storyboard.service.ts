import { ollamaService } from './ollama.service.js';
import { subtitleService } from './subtitle.service.js';
import { buildStoryboardPrompt } from '../prompts/storyboard.prompt.js';
import { ensureSceneVisuals } from './storyboard.visuals.js';
import { StoryboardPlanSchema } from '@edumotion/shared';
import { AppError } from '../middleware/errorHandler.js';
import type { StoryboardPlan, VideoConfig, SubtitleEntry, SceneInstruction, ComponentName } from '@edumotion/shared';

/** Mirrors ComponentNameSchema; typed so a typo cannot drift from the union. */
const VALID_COMPONENTS: ReadonlySet<string> = new Set<ComponentName>([
  'AnimatedText', 'AnimatedNumber', 'Character', 'Teacher', 'EducationalObject',
  'ObjectGroup', 'MultiplicationTable', 'ImageScene', 'BackgroundScene',
  'Subtitle', 'QuestionCard', 'Confetti', 'EndScreen', 'ProgressBar',
]);

class StoryboardService {
  /**
   * Generate a storyboard from an approved script and audio duration.
   * Calls Ollama with a structured JSON output prompt, then validates with Zod.
   */
  async planStoryboard(
    jobId: string,
    script: string,
    config: VideoConfig,
    audioDurationMs: number,
    subtitles: SubtitleEntry[],
  ): Promise<StoryboardPlan> {
    const prompt = buildStoryboardPrompt(script, config, audioDurationMs);

    const raw = await ollamaService.chat(
      [
        {
          role: 'system',
          content:
            'You are a video storyboard planner. You output only valid JSON with no markdown fences, no explanation.',
        },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.4, num_predict: 4096 },
    );

    // Extract JSON from the response (strip any accidental markdown)
    const jsonText = this.extractJson(raw);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      throw new AppError(
        'STORYBOARD_PARSE_ERROR',
        `Storyboard JSON parse failed: ${String(err)}`,
        500,
        { raw: raw.slice(0, 500) },
      );
    }

    // Inject jobId and computed totals before validation
    const totalFrames = Math.ceil((audioDurationMs / 1000) * config.fps);
    const withMeta = {
      ...(parsed as Record<string, unknown>),
      jobId,
      totalFrames,
      fps: config.fps,
      audioDurationMs,
    };

    const result = StoryboardPlanSchema.safeParse(withMeta);
    if (!result.success) {
      // Attempt to auto-repair common issues before giving up
      const repaired = this.repairStoryboard(withMeta, totalFrames);
      const retryResult = StoryboardPlanSchema.safeParse(repaired);
      if (!retryResult.success) {
        throw new AppError(
          'STORYBOARD_INVALID',
          'Generated storyboard failed schema validation',
          500,
          retryResult.error.errors,
        );
      }
      return this.finalize(retryResult.data, subtitles, script, jobId);
    }

    return this.finalize(result.data, subtitles, script, jobId);
  }

  /**
   * Attach captions and make sure each scene carries a topical graphic. The
   * model is asked for visuals in the prompt, but it reliably falls back to
   * text-only scenes, which renders as a slideshow of captions.
   */
  private finalize(
    storyboard: StoryboardPlan,
    subtitles: SubtitleEntry[],
    script: string,
    jobId: string,
  ): StoryboardPlan {
    const withCaptions = this.injectSubtitles(storyboard, subtitles);
    const { storyboard: withVisuals, injected } = ensureSceneVisuals(withCaptions, script);
    if (injected > 0) {
      console.log(`[Storyboard] Job ${jobId}: added ${injected} topic visual(s)`);
    }
    return withVisuals;
  }

  /**
   * Distribute subtitle entries into each scene's Subtitle child component.
   */
  injectSubtitles(
    storyboard: StoryboardPlan,
    subtitles: SubtitleEntry[],
  ): StoryboardPlan {
    const sceneMap = subtitleService.alignToScenes(
      subtitles,
      storyboard.scenes.map((s) => ({
        id: s.id,
        startFrame: s.startFrame,
        endFrame: s.endFrame,
        fps: storyboard.fps,
      })),
    );

    const updatedScenes: SceneInstruction[] = storyboard.scenes.map((scene) => {
      const sceneSubtitles = sceneMap.get(scene.id) ?? [];

      // Find existing Subtitle child and update, or add new one
      const existingChildren = scene.children ?? [];
      const hasSubtitle = existingChildren.some((c) => c.component === 'Subtitle');

      const children = hasSubtitle
        ? existingChildren.map((c) =>
            c.component === 'Subtitle'
              ? { ...c, props: { ...c.props, entries: sceneSubtitles } }
              : c,
          )
        : [
            ...existingChildren,
            { component: 'Subtitle' as const, props: { entries: sceneSubtitles } },
          ];

      return { ...scene, children };
    });

    return { ...storyboard, scenes: updatedScenes };
  }

  /**
   * Distribute timeline evenly across scenes when the LLM output is structurally
   * valid but frame ranges are off.
   */
  distributeTimeline(storyboard: StoryboardPlan): StoryboardPlan {
    const { scenes, totalFrames } = storyboard;
    const count = scenes.length;
    const framesPerScene = Math.floor(totalFrames / count);

    const updated: SceneInstruction[] = scenes.map((scene, i) => ({
      ...scene,
      startFrame: i * framesPerScene,
      endFrame: i === count - 1 ? totalFrames : (i + 1) * framesPerScene,
    }));

    return { ...storyboard, scenes: updated };
  }

  // ---- Private helpers ----

  private extractJson(text: string): string {
    // Strip markdown code fences
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch?.[1]) return fenceMatch[1].trim();

    // Find first { and last }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      return text.slice(start, end + 1);
    }

    return text.trim();
  }

  private repairStoryboard(
    raw: Record<string, unknown>,
    totalFrames: number,
  ): Record<string, unknown> {
    const isRecord = (value: unknown): value is Record<string, unknown> =>
      typeof value === 'object' && value !== null && !Array.isArray(value);

    // Drop scenes/children whose component name was invented rather than
    // rejecting the whole storyboard: one bad name used to kill the job after a
    // full LLM round trip.
    const scenes = (Array.isArray(raw['scenes']) ? raw['scenes'] : [])
      .filter(isRecord)
      .map((scene, i) => {
        const component =
          typeof scene['component'] === 'string' && VALID_COMPONENTS.has(scene['component'])
            ? scene['component']
            : 'BackgroundScene';
        const children = (Array.isArray(scene['children']) ? scene['children'] : [])
          .filter(isRecord)
          .filter((child) =>
            typeof child['component'] === 'string' && VALID_COMPONENTS.has(child['component']),
          )
          .map((child) => ({
            component: child['component'],
            props: isRecord(child['props']) ? child['props'] : {},
          }));

        return {
          id: typeof scene['id'] === 'string' && scene['id'] ? scene['id'] : `scene-${i + 1}`,
          component,
          props: isRecord(scene['props']) ? scene['props'] : {},
          children,
        };
      });

    if (scenes.length === 0) {
      // Minimal deterministic storyboard so the job still produces a video.
      return {
        ...raw,
        scenes: [
          {
            id: 'scene-1',
            startFrame: 0,
            endFrame: totalFrames,
            component: 'BackgroundScene',
            props: { theme: 'educational' },
            children: [
              {
                component: 'AnimatedText',
                props: { text: 'Educational Video', animation: 'fadeIn', startFrame: 15 },
              },
            ],
          },
        ],
      };
    }

    // Rebuild a contiguous timeline so the schema's frame checks pass.
    const framesPerScene = Math.max(1, Math.floor(totalFrames / scenes.length));
    const repairedScenes = scenes.map((scene, i) => ({
      ...scene,
      startFrame: i * framesPerScene,
      endFrame:
        i === scenes.length - 1
          ? Math.max(i * framesPerScene + 1, totalFrames)
          : (i + 1) * framesPerScene,
    }));

    return { ...raw, scenes: repairedScenes };
  }
}

export const storyboardService = new StoryboardService();
