import { ollamaService } from './ollama.service.js';
import { subtitleService } from './subtitle.service.js';
import { buildStoryboardPrompt } from '../prompts/storyboard.prompt.js';
import { ensureSceneVisuals } from './storyboard.visuals.js';
import { parseLooseJson } from './json.repair.js';
import { StoryboardPlanSchema } from '@edumotion/shared';
import { AppError } from '../middleware/errorHandler.js';
import type { StoryboardPlan, VideoConfig, SubtitleEntry, SceneInstruction, ComponentName } from '@edumotion/shared';

/** Mirrors ComponentNameSchema; typed so a typo cannot drift from the union. */
const VALID_COMPONENTS: ReadonlySet<ComponentName> = new Set<ComponentName>([
  'AnimatedText', 'AnimatedNumber', 'Character', 'Teacher', 'EducationalObject',
  'ObjectGroup', 'ConceptDiagram', 'MultiplicationTable', 'ImageScene',
  'BackgroundScene', 'Subtitle', 'QuestionCard', 'Confetti', 'EndScreen',
  'ProgressBar',
]);

/** Case-insensitive lookup: the model writes "animatedtext" as often as "AnimatedText". */
const COMPONENT_LOOKUP: ReadonlyMap<string, ComponentName> = new Map(
  [...VALID_COMPONENTS].map((name) => [name.toLowerCase(), name]),
);

class StoryboardService {
  /**
   * Generate a storyboard from an approved script and audio duration.
   * Calls the local LLM with a structured JSON output prompt, then validates
   * with Zod, repairing what the model got wrong before retrying it.
   */
  async planStoryboard(
    jobId: string,
    script: string,
    config: VideoConfig,
    audioDurationMs: number,
    subtitles: SubtitleEntry[],
  ): Promise<StoryboardPlan> {
    const prompt = buildStoryboardPrompt(script, config, audioDurationMs);
    const totalFrames = Math.ceil((audioDurationMs / 1000) * config.fps);

    const messages = [
      {
        role: 'system' as const,
        content:
          'You are a video storyboard planner. You output only valid JSON with no markdown fences, no explanation. ' +
          'Separate every array element and every object property with a comma and never leave a trailing comma.',
      },
      { role: 'user' as const, content: prompt },
    ];

    // A small local model hits the token budget or slips a comma often enough
    // that one cold retry is much cheaper than failing the job — the worker's
    // retry re-runs TTS from scratch.
    const attempts = 2;
    let lastFailure = 'no attempt was made';

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const raw = await ollamaService.chat(messages, {
        temperature: attempt === 1 ? 0.4 : 0.1,
        num_predict: 4096,
      });

      let parsed: unknown;
      try {
        parsed = parseLooseJson(raw);
      } catch (err) {
        lastFailure = `JSON parse failed: ${(err as Error).message}`;
        console.warn(`[Storyboard] Job ${jobId}: attempt ${attempt}/${attempts} — ${lastFailure}`);
        continue;
      }

      // Inject jobId and computed totals before validation
      const withMeta = {
        ...this.normalizeRoot(parsed),
        jobId,
        totalFrames,
        fps: config.fps,
        audioDurationMs,
      };

      const direct = StoryboardPlanSchema.safeParse(withMeta);
      if (direct.success) return this.finalize(direct.data, subtitles, script, jobId);

      // Attempt to auto-repair common issues before giving up
      const retryResult = StoryboardPlanSchema.safeParse(
        this.repairStoryboard(withMeta, totalFrames),
      );
      if (retryResult.success) {
        console.warn(`[Storyboard] Job ${jobId}: repaired a malformed storyboard`);
        return this.finalize(retryResult.data, subtitles, script, jobId);
      }

      lastFailure = this.describeIssues(retryResult.error.errors);
      console.warn(`[Storyboard] Job ${jobId}: attempt ${attempt}/${attempts} — ${lastFailure}`);
    }

    throw new AppError(
      'STORYBOARD_INVALID',
      `Generated storyboard failed schema validation: ${lastFailure}`,
      500,
    );
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

  /**
   * Models wrap the storyboard in "storyboard" or return the bare scene array;
   * both are unwrapped into the object shape the schema expects.
   */
  private normalizeRoot(parsed: unknown): Record<string, unknown> {
    if (Array.isArray(parsed)) return { scenes: parsed };
    if (typeof parsed !== 'object' || parsed === null) return {};

    const record = parsed as Record<string, unknown>;
    const nested = record['storyboard'];
    if (typeof nested === 'object' && nested !== null && !Array.isArray(nested)) {
      return nested as Record<string, unknown>;
    }
    return record;
  }

  /** Compact, log-friendly description of the first few schema problems. */
  private describeIssues(issues: Array<{ path: Array<string | number>; message: string }>): string {
    return issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
  }

  private repairStoryboard(
    raw: Record<string, unknown>,
    totalFrames: number,
  ): Record<string, unknown> {
    const isRecord = (value: unknown): value is Record<string, unknown> =>
      typeof value === 'object' && value !== null && !Array.isArray(value);

    const toComponent = (value: unknown): ComponentName | null =>
      typeof value === 'string'
        ? COMPONENT_LOOKUP.get(value.trim().toLowerCase()) ?? null
        : null;

    // Drop scenes/children whose component name was invented rather than
    // rejecting the whole storyboard: one bad name used to kill the job after a
    // full LLM round trip.
    const scenes = (Array.isArray(raw['scenes']) ? raw['scenes'] : [])
      .filter(isRecord)
      .map((scene, i) => {
        const component = toComponent(scene['component']) ?? 'BackgroundScene';

        const children = (Array.isArray(scene['children']) ? scene['children'] : [])
          .map((child) => {
            if (!isRecord(child)) return null;
            const childComponent = toComponent(child['component']);
            if (!childComponent) return null;
            return {
              component: childComponent,
              props: isRecord(child['props']) ? child['props'] : {},
            };
          })
          .filter(
            (child): child is { component: ComponentName; props: Record<string, unknown> } =>
              child !== null,
          );

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
