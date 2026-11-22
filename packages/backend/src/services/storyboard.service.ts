import { ollamaService } from './ollama.service.js';
import { subtitleService } from './subtitle.service.js';
import { storyboardValidator } from './storyboard.validation.js';
import { buildStoryboardPrompt } from '../prompts/storyboard.prompt.js';
import { ensureSceneVisuals, type SceneAssetUse } from './storyboard.visuals.js';
import { directStoryboard } from './scene.director.js';
import { parseLooseJson } from './json.repair.js';
import { StoryboardPlanSchema, type StoryboardPlan, type VideoConfig, type SubtitleEntry, type SceneInstruction, type ComponentName } from '@edumotion/shared';
import { AppError } from '../middleware/errorHandler.js';

/** Mirrors ComponentNameSchema; typed so a typo cannot drift from the union. */
const VALID_COMPONENTS: ReadonlySet<ComponentName> = new Set<ComponentName>([
  'AnimatedText', 'AnimatedNumber', 'Character', 'Teacher', 'EducationalObject',
  'ObjectGroup', 'ConceptDiagram', 'MultiplicationTable', 'ImageScene',
  'BackgroundScene', 'Subtitle', 'QuestionCard', 'Confetti', 'EndScreen',
  'ProgressBar',
  'SplitScreenComparison',
  'ProcessFlow',
  'Timeline',
  'HighlightedRegion',
  'AnimatedDiagram',
  'NumberCounter',
  'KineticTypography',
  'ObjectZoom',
  'Callout',
  'SpeechBubble',
  'AnnotatedCallout',
  'ComparisonChart',
  'SummaryScene',
]);

/** Case-insensitive lookup: the model writes "animatedtext" as often as "AnimatedText". */
const COMPONENT_LOOKUP: ReadonlyMap<string, ComponentName> = new Map(
  [...VALID_COMPONENTS].map((name) => [name.toLowerCase(), name]),
);

export interface PlannedStoryboard {
  storyboard: StoryboardPlan;
  /** Which artwork each scene's diagram tiles took, for the render page. */
  assetUses: SceneAssetUse[];
}

/**
 * Enhanced Storyboard Service with educational validation and improved planning
 */
class StoryboardService {
  /**
   * Generate a storyboard from an approved script and audio duration.
   * Now includes validation, repair, and educational enhancement.
   */
  async planStoryboard(
    jobId: string,
    script: string,
    config: VideoConfig,
    audioDurationMs: number,
    subtitles: SubtitleEntry[],
  ): Promise<PlannedStoryboard> {
    const prompt = buildStoryboardPrompt(script, config, audioDurationMs);
    const totalFrames = Math.ceil((audioDurationMs / 1000) * config.fps);

    const messages = [
      {
        role: 'system' as const,
        content:
          'You are a professional educational video storyboard planner. You output only valid JSON with no markdown fences, no explanation. ' +
          'Every scene MUST have relevant visuals that explain the narration. ' +
          'Use diverse layouts and animations. ' +
          'Separate every array element and every object property with a comma and never leave a trailing comma.',
      },
      { role: 'user' as const, content: prompt },
    ];

    // Try multiple attempts with different strategies
    const attempts = 3;
    let lastFailure = 'no attempt was made';
    let bestAttempt: StoryboardPlan | null = null;
    let bestAssetUses: SceneAssetUse[] = [];
    let bestScore = 0;
    // A storyboard that parsed cleanly but only missed a quality warning. It is
    // still a designed video, so it must never be thrown away in favour of the
    // generic slideshow (that is how one weak scene used to sink a whole job).
    let backupAttempt: StoryboardPlan | null = null;
    let backupAssetUses: SceneAssetUse[] = [];
    let backupScore = -1;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const raw = await ollamaService.chat(messages, {
        temperature: attempt === 1 ? 0.3 : attempt === 2 ? 0.1 : 0.05,
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
      if (direct.success) {
        const withCaptions = this.injectSubtitles(direct.data, subtitles);
        const { storyboard: withVisuals, injected, assetUses } = ensureSceneVisuals(withCaptions, script);

        // Validate the storyboard
        const validation = storyboardValidator.validate(withVisuals, script);
        const relevanceScore = validation.sceneResults.reduce((sum: number, s: { visualRelevance?: number }) => sum + (s.visualRelevance || 0), 0) / validation.sceneResults.length;

        if (validation.isValid && relevanceScore > bestScore) {
          bestScore = relevanceScore;
          bestAttempt = withVisuals;
          bestAssetUses = assetUses;
          console.log(`[Storyboard] Job ${jobId}: attempt ${attempt} valid with relevance score: ${relevanceScore.toFixed(2)}`);

          // If we have a perfect or near-perfect score, stop here
          if (relevanceScore >= 0.8) {
            console.log(`[Storyboard] Job ${jobId}: high relevance score achieved, stopping early`);
            break;
          }
        } else {
          console.warn(`[Storyboard] Job ${jobId}: attempt ${attempt} validation failed: ${validation.overallIssues.join('; ')}`);
          if (relevanceScore > backupScore) {
            backupScore = relevanceScore;
            backupAttempt = withVisuals;
            backupAssetUses = assetUses;
            console.warn(
              `[Storyboard] Job ${jobId}: keeping attempt ${attempt} as the best storyboard so far ` +
                `(relevance ${relevanceScore.toFixed(2)})`,
            );
          }
        }

        continue;
      }

      // Attempt to auto-repair common issues before giving up
      const retryResult = StoryboardPlanSchema.safeParse(
        this.repairStoryboard(withMeta, totalFrames),
      );
      if (retryResult.success) {
        const withCaptions = this.injectSubtitles(retryResult.data, subtitles);
        const { storyboard: withVisuals, injected, assetUses } = ensureSceneVisuals(withCaptions, script);

        const validation = storyboardValidator.validate(withVisuals, script);
        const relevanceScore = validation.sceneResults.reduce((sum: number, s: { visualRelevance?: number }) => sum + (s.visualRelevance || 0), 0) / validation.sceneResults.length;

        if (validation.isValid && relevanceScore > bestScore) {
          bestScore = relevanceScore;
          bestAttempt = withVisuals;
          bestAssetUses = assetUses;
          console.log(`[Storyboard] Job ${jobId}: repaired attempt ${attempt} with relevance score: ${relevanceScore.toFixed(2)}`);
        } else if (relevanceScore > backupScore) {
          backupScore = relevanceScore;
          backupAttempt = withVisuals;
          backupAssetUses = assetUses;
        }
      }

      lastFailure = this.describeIssues(retryResult?.error?.errors || []);
      console.warn(`[Storyboard] Job ${jobId}: attempt ${attempt}/${attempts} — ${lastFailure}`);
    }

    const chosenAttempt = bestAttempt ?? backupAttempt;
    const chosenAssetUses = bestAttempt ? bestAssetUses : backupAssetUses;

    if (!bestAttempt && chosenAttempt) {
      console.warn(
        `[Storyboard] Job ${jobId}: no attempt passed validation; using the best storyboard ` +
          `(relevance ${backupScore.toFixed(2)}) instead of a fallback slideshow`,
      );
    }

    if (chosenAttempt) {
      // Visual direction is deterministic and runs after the model: palettes,
      // patterns, camera moves, short headings and the closing end screen.
      const { storyboard: directed, changes } = directStoryboard(chosenAttempt, script);
      if (changes.length > 0) {
        console.log(
          `[Storyboard] Job ${jobId}: directed ${changes.length} change(s) — ${changes.slice(0, 4).join('; ')}`,
        );
      }

      const finalValidation = storyboardValidator.validate(directed, script);
      if (finalValidation.isValid) {
        console.log(
          `[Storyboard] Job ${jobId}: final storyboard valid with ${finalValidation.validScenes}/${finalValidation.totalScenes} scenes`,
        );
      } else {
        // Keep the directed storyboard: it is still a designed video, and the
        // per-scene diagnostics say exactly what is weak. Falling back to a
        // generic slideshow would hide those problems instead of surfacing them.
        for (const result of finalValidation.sceneResults) {
          if (!result.isValid) {
            console.warn(
              `[Storyboard] Job ${jobId}: ${result.sceneId} issues — ${result.issues.join('; ')} ` +
                `(relevance ${result.visualRelevance?.toFixed(2) ?? 'n/a'})`,
            );
          }
        }
        console.warn(
          `[Storyboard] Job ${jobId}: using directed storyboard despite ${finalValidation.overallIssues.length} issue(s)`,
        );
      }
      return { storyboard: directed, assetUses: chosenAssetUses };
    }

    // No attempt produced a usable storyboard: build a deterministic one and give
    // it the same visual direction so the output still looks designed.
    console.warn(`[Storyboard] Job ${jobId}: all attempts failed, creating fallback storyboard`);
    const fallback = this.createFallbackStoryboard(jobId, script, config, totalFrames, subtitles);
    // The fallback has no diagram tiles, so there is no artwork to report.
    return { storyboard: directStoryboard(fallback, script).storyboard, assetUses: [] };
  }

  /**
   * Create a fallback storyboard when all generation attempts fail
   */
  private createFallbackStoryboard(
    jobId: string,
    script: string,
    config: VideoConfig,
    totalFrames: number,
    subtitles: SubtitleEntry[],
  ): StoryboardPlan {
    const sentences = script.split('\n').filter(s => s.trim().length > 0);
    const sceneCount = Math.min(6, Math.max(3, sentences.length));
    const framesPerScene = Math.floor(totalFrames / sceneCount);

    const scenes: SceneInstruction[] = [];

    for (let i = 0; i < sceneCount; i++) {
      const startFrame = i * framesPerScene;
      const endFrame = i === sceneCount - 1 ? totalFrames : (i + 1) * framesPerScene;

      // Get sentence for this scene
      const sentence = sentences[Math.min(i, sentences.length - 1)] ?? '';

      // Infer visual type from sentence
      const visualType = this.inferVisualType(sentence);

      scenes.push({
        id: `scene-${i + 1}`,
        startFrame,
        endFrame,
        component: 'BackgroundScene',
        props: { theme: config.animationTheme || 'educational' },
        children: [
          {
            component: 'EducationalObject',
            props: {
              type: visualType,
              size: 200,
              top: '50%',
              left: '50%',
              startFrame: startFrame + 10,
              animation: 'fadeIn',
            },
          },
          {
            component: 'AnimatedText',
            props: {
              text: this.extractKeyPhrase(sentence),
              animation: 'words',
              fontSize: 56,
              top: '20%',
              startFrame: startFrame + 15,
            },
          },
          {
            component: 'Subtitle',
            props: { entries: [] },
          },
        ],
      });
    }

    // Inject subtitles
    const withCaptions = this.injectSubtitles(
      { jobId, totalFrames, fps: config.fps, audioDurationMs: totalFrames * 1000 / config.fps, scenes },
      subtitles
    );

    return withCaptions;
  }

  /**
   * Infer visual type from sentence
   */
  private inferVisualType(sentence: string): string {
    const lower = sentence.toLowerCase();

    const typeMap: Array<[RegExp, string]> = [
      [/photo\w*|chlorophyll|leaf|plant|sunlight|green/, 'leaf'],
      [/bone|skeleton|femur|skull|rib|206/, 'skeleton'],
      [/cell|dna|gene|nucleus|organism/, 'cell'],
      [/atom|molecule|electron|proton|neutron|chemistry/, 'atom'],
      [/computer|network|internet|server|technology|digital/, 'computer'],
      [/brain|neuron|mind|thinking|synaptic/, 'brain'],
      [/heart|circulation|blood|pump|cardiovascular/, 'heart'],
      [/water|liquid|ocean|river|rain|drink|h2o/, 'water'],
      [/sun|light|solar|energy|star|day/, 'sun'],
      [/math|mathematics|equation|algebra|geometry|calculus/, 'calculator'],
      [/space|planet|moon|mars|rocket|astronaut|galaxy/, 'rocket'],
      [/history|war|discovery|exploration|civilization|past/, 'book'],
      [/map|country|continent|geography|location|place/, 'globe'],
      [/food|nutrition|cooking|recipe|ingredient|eat/, 'apple'],
    ];

    for (const [pattern, type] of typeMap) {
      if (pattern.test(lower)) {
        return type;
      }
    }

    // Default based on common words
    if (lower.includes('life') || lower.includes('organism') || lower.includes('body')) {
      return 'cell';
    }
    if (lower.includes('earth') || lower.includes('world') || lower.includes('planet')) {
      return 'globe';
    }
    if (lower.includes('idea') || lower.includes('think') || lower.includes('learn')) {
      return 'lightbulb';
    }

    return 'book'; // Default
  }

  /**
   * Extract key phrase from sentence
   */
  private extractKeyPhrase(sentence: string): string {
    // Remove leading questions
    let text = sentence.replace(/^(have|do|does|did|can|could|would|what|why|how|when|where|who|is|are|was|were|will)\s+/i, '');

    // Remove trailing punctuation
    text = text.replace(/[.!?]$/, '');

    // Limit length
    if (text.length > 40) {
      text = text.substring(0, 37) + '...';
    }

    return text;
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
