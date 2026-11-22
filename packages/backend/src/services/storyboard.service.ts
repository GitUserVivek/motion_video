import { ollamaService } from './ollama.service.js';
import { subtitleService } from './subtitle.service.js';
import { storyboardValidator } from './storyboard.validation.js';
import { buildStoryboardPrompt } from '../prompts/storyboard.prompt.js';
import { ensureSceneVisuals, type SceneAssetUse } from './storyboard.visuals.js';
import { directStoryboard } from './scene.director.js';
import { normalizeStoryboardTiming } from './timing.service.js';
import { parseLooseJson } from './json.repair.js';
import {
  StoryboardPlanSchema,
  type StoryboardPlan,
  type VideoConfig,
  type SubtitleEntry,
  type SceneInstruction,
  type ComponentName,
  type ContentAnalysis,
} from '@edumotion/shared';
import { formatContentAnalysisForStoryboard } from '../prompts/content-analysis.prompt.js';
import { deriveContentAnalysis } from './content.analysis.js';
import { AppError } from '../middleware/errorHandler.js';
import fs from 'fs';
import path from 'path';
// Aliased: planStoryboard takes the video config as a parameter named `config`.
import { config as appConfig } from '../config.js';
import { jobFiles } from './job.files.js';

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

type ValidationSummary = ReturnType<typeof storyboardValidator.validate>;

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'been', 'were',
  'will', 'into', 'than', 'then', 'they', 'them', 'their', 'there', 'here',
  'its', 'our', 'your', 'you', 'are', 'was', 'but', 'not', 'can', 'could',
  'would', 'should', 'about', 'when', 'where', 'which', 'while', 'what', 'how',
  'why', 'who', 'all', 'any', 'each', 'more', 'most', 'some', 'such', 'very',
  'also', 'just', 'like', 'over', 'under', 'between', 'through', 'because',
]);

/** One model response, exactly as received, plus what happened to it. */
interface LlmAttemptLog {
  attempt: number;
  startedAt: string;
  elapsedMs: number;
  temperature: number;
  response: string;
  parse: 'ok' | 'failed';
  parseError?: string;
  schema: 'ok' | 'repaired' | 'failed';
  schemaIssues?: string[];
  validation?: {
    isValid: boolean;
    validScenes: number;
    totalScenes: number;
    relevance: number;
    issues: string[];
  };
}

function summarizeValidation(validation: ValidationSummary): NonNullable<LlmAttemptLog['validation']> {
  const scenes = validation.sceneResults;
  const relevance =
    scenes.length === 0
      ? 0
      : scenes.reduce((sum, scene) => sum + Number(scene.visualRelevance ?? 0), 0) / scenes.length;

  return {
    isValid: validation.isValid,
    validScenes: validation.validScenes,
    totalScenes: validation.totalScenes,
    relevance: Number(relevance.toFixed(3)),
    issues: validation.overallIssues,
  };
}

/** Best-effort JSON artifact: a failed write must never fail the render job. */
function writeJobJson(jobId: string, filePath: string, data: unknown): void {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn(
      `[Storyboard] Job ${jobId}: could not write ${path.basename(filePath)} — ` +
        (err instanceof Error ? err.message : String(err)),
    );
  }
}

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
    analysis?: ContentAnalysis,
  ): Promise<PlannedStoryboard> {
    // The approved narration is the single source of truth. If the caller did
    // not pass an analysis, derive a deterministic one instead of guessing from a
    // topic string.
    const content = analysis ?? deriveContentAnalysis({ script });
    const prompt = buildStoryboardPrompt(script, config, audioDurationMs, content);
    console.log(
      `[Storyboard] Job ${jobId}: using ${content.domain} analysis ` +
        `(${content.keyTerms.length} key term(s), ${content.claims.length} claim(s))`,
    );
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

    // Every response the model produced for this job is written to
    // output/<jobId>/llm/storyboard.json (and again once the final storyboard is
    // known), so what it actually said can be inspected after the fact.
    const attemptsLog: LlmAttemptLog[] = [];
    let chosenMeta: {
      attempt: number | null;
      source: 'validated' | 'best-so-far' | 'fallback';
      relevance: number | null;
    } = { attempt: null, source: 'fallback', relevance: null };

    const flushLlmLog = (finalStoryboard: StoryboardPlan | null): void => {
      writeJobJson(jobId, jobFiles.llmStoryboard(jobId), {
        jobId,
        createdAt: new Date().toISOString(),
        model: appConfig.localLlm.modelName,
        request: { system: messages[0]?.content ?? '', user: prompt },
        chosen: chosenMeta,
        attempts: attemptsLog,
        finalStoryboard,
      });
      if (finalStoryboard) {
        writeJobJson(jobId, jobFiles.storyboard(jobId), finalStoryboard);
      }
    };

    // Try multiple attempts with different strategies
    const attempts = 3;
    let lastFailure = 'no attempt was made';
    let bestAttempt: StoryboardPlan | null = null;
    let bestAssetUses: SceneAssetUse[] = [];
    let bestScore = 0;
    let bestAttemptNumber: number | null = null;
    let backupAttemptNumber: number | null = null;
    // A storyboard that parsed cleanly but only missed a quality warning. It is
    // still a designed video, so it must never be thrown away in favour of the
    // generic slideshow (that is how one weak scene used to sink a whole job).
    let backupAttempt: StoryboardPlan | null = null;
    let backupAssetUses: SceneAssetUse[] = [];
    let backupScore = -1;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const temperature = attempt === 1 ? 0.3 : attempt === 2 ? 0.1 : 0.05;
      const startedAtMs = Date.now();
      const startedAt = new Date(startedAtMs).toISOString();

      const raw = await ollamaService.chat(messages, {
        temperature,
        num_predict: 4096,
      });
      const elapsedMs = Date.now() - startedAtMs;

      let parsed: unknown;
      try {
        parsed = parseLooseJson(raw);
      } catch (err) {
        lastFailure = `JSON parse failed: ${(err as Error).message}`;
        attemptsLog.push({
          attempt,
          startedAt,
          elapsedMs,
          temperature,
          response: raw,
          parse: 'failed',
          parseError: lastFailure,
          schema: 'failed',
        });
        flushLlmLog(null);
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
        topic: content.topic,
        domain: content.domain,
        educationalObjective: content.learningObjectives[0],
      };

      const direct = StoryboardPlanSchema.safeParse(withMeta);
      if (direct.success) {
        const withCaptions = this.injectSubtitles(
          this.ensureBackgroundRoots(direct.data),
          subtitles,
        );
        const { storyboard: withVisuals, injected, assetUses } = ensureSceneVisuals(
          withCaptions,
          script,
          content,
          jobId,
        );

        // Validate the storyboard
        const validation = storyboardValidator.validate(withVisuals, script);
        const relevanceScore = validation.sceneResults.reduce((sum: number, s: { visualRelevance?: number }) => sum + (s.visualRelevance || 0), 0) / validation.sceneResults.length;

        attemptsLog.push({
          attempt,
          startedAt,
          elapsedMs,
          temperature,
          response: raw,
          parse: 'ok',
          schema: 'ok',
          validation: summarizeValidation(validation),
        });
        flushLlmLog(null);

        if (validation.isValid && relevanceScore > bestScore) {
          bestScore = relevanceScore;
          bestAttempt = withVisuals;
          bestAssetUses = assetUses;
          bestAttemptNumber = attempt;
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
            backupAttemptNumber = attempt;
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
        const withCaptions = this.injectSubtitles(
          this.ensureBackgroundRoots(retryResult.data),
          subtitles,
        );
        const { storyboard: withVisuals, injected, assetUses } = ensureSceneVisuals(
          withCaptions,
          script,
          content,
          jobId,
        );

        const validation = storyboardValidator.validate(withVisuals, script);
        const relevanceScore = validation.sceneResults.reduce((sum: number, s: { visualRelevance?: number }) => sum + (s.visualRelevance || 0), 0) / validation.sceneResults.length;

        attemptsLog.push({
          attempt,
          startedAt,
          elapsedMs,
          temperature,
          response: raw,
          parse: 'ok',
          schema: 'repaired',
          validation: summarizeValidation(validation),
        });
        flushLlmLog(null);

        if (validation.isValid && relevanceScore > bestScore) {
          bestScore = relevanceScore;
          bestAttempt = withVisuals;
          bestAssetUses = assetUses;
          bestAttemptNumber = attempt;
          console.log(`[Storyboard] Job ${jobId}: repaired attempt ${attempt} with relevance score: ${relevanceScore.toFixed(2)}`);
        } else if (relevanceScore > backupScore) {
          backupScore = relevanceScore;
          backupAttempt = withVisuals;
          backupAssetUses = assetUses;
          backupAttemptNumber = attempt;
        }
      } else {
        // Parsed as JSON but the schema did not fit even after repair.
        attemptsLog.push({
          attempt,
          startedAt,
          elapsedMs,
          temperature,
          response: raw,
          parse: 'ok',
          schema: 'failed',
          schemaIssues: retryResult.error.errors.map(
            (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
          ),
        });
        flushLlmLog(null);
      }

      lastFailure = this.describeIssues(retryResult?.error?.errors || []);
      console.warn(`[Storyboard] Job ${jobId}: attempt ${attempt}/${attempts} — ${lastFailure}`);
    }

    const chosenAttempt = bestAttempt ?? backupAttempt;
    const chosenAssetUses = bestAttempt ? bestAssetUses : backupAssetUses;

    chosenMeta = bestAttempt
      ? { attempt: bestAttemptNumber, source: 'validated', relevance: Number(bestScore.toFixed(3)) }
      : backupAttempt
        ? { attempt: backupAttemptNumber, source: 'best-so-far', relevance: Number(backupScore.toFixed(3)) }
        : { attempt: null, source: 'fallback', relevance: null };

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

      const { storyboard: timed, report: timing } = normalizeStoryboardTiming(directed);
      writeJobJson(jobId, jobFiles.timingReport(jobId), timing);
      if (timing.repaired > 0) {
        console.warn(
          `[Timing] Job ${jobId}: repaired ${timing.repaired} child start frame(s) ` +
            `(${timing.issues.slice(0, 3).join('; ')})`,
        );
      }

      const finalValidation = storyboardValidator.validate(timed, script);
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
      flushLlmLog(timed);
      return { storyboard: timed, assetUses: chosenAssetUses };
    }

    // No attempt produced a usable storyboard: build a deterministic one and give
    // it the same visual direction so the output still looks designed.
    console.warn(`[Storyboard] Job ${jobId}: all attempts failed, creating fallback storyboard`);
    const fallback = this.createFallbackStoryboard(
      jobId,
      script,
      config,
      totalFrames,
      subtitles,
      content,
    );
    const directedFallback = directStoryboard(fallback, script).storyboard;
    const { storyboard: timedFallback, report: fallbackTiming } =
      normalizeStoryboardTiming(directedFallback);
    writeJobJson(jobId, jobFiles.timingReport(jobId), fallbackTiming);
    if (fallbackTiming.repaired > 0) {
      console.warn(`[Timing] Job ${jobId}: fallback repaired ${fallbackTiming.repaired} child frame(s)`);
    }
    flushLlmLog(timedFallback);
    // The fallback has no downloaded artwork to report here; the worker attaches
    // scene artwork and writes the final manifest after planning.
    return { storyboard: timedFallback, assetUses: [] };
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
    analysis: ContentAnalysis,
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
      const items = this.fallbackDiagramItems(sentence, analysis);

      scenes.push({
        id: `scene-${i + 1}`,
        startFrame,
        endFrame,
        component: 'BackgroundScene',
        props: { theme: config.animationTheme || 'educational' },
        children: [
          {
            // A neutral labelled diagram is used instead of guessing a random
            // object from a keyword. Only an explicitly named object becomes an
            // EducationalObject.
            component: 'ConceptDiagram',
            props: {
              items,
              top: '52%',
              left: '50%',
              startFrame: 10,
            },
          },
          {
            component: 'AnimatedText',
            props: {
              text: this.extractKeyPhrase(sentence),
              animation: 'words',
              fontSize: 56,
              top: '20%',
              startFrame: 4,
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
      {
        jobId,
        totalFrames,
        fps: config.fps,
        audioDurationMs: totalFrames * 1000 / config.fps,
        topic: analysis.topic,
        domain: analysis.domain,
        educationalObjective: analysis.learningObjectives[0],
        timingMode: 'scene-relative',
        scenes,
      },
      subtitles
    );

    return withCaptions;
  }

  /**
   * Build a neutral, narration-grounded diagram for the deterministic fallback.
   * It never maps a generic word to an unrelated icon.
   */
  private fallbackDiagramItems(
    sentence: string,
    analysis: ContentAnalysis,
  ): Array<{ icon: string; label: string }> {
    const lower = sentence.toLowerCase();
    const relevant = analysis.keyTerms.filter(
      (term) =>
        lower.includes(term.term.toLowerCase()) ||
        term.synonyms.some((synonym) => lower.includes(synonym.toLowerCase())),
    );
    const chosen = (relevant.length > 0 ? relevant : analysis.keyTerms).slice(0, 3);
    const labels = chosen.length > 0
      ? chosen.map((term) => term.term)
      : [...new Set(
          lower
            .replace(/[^a-z0-9 ]+/g, ' ')
            .split(/\s+/)
            .filter((word) => word.length > 4 && !STOPWORDS.has(word)),
        )].slice(0, 3);

    const items = labels.map((label) => ({
      icon: this.explicitObjectType(label) ?? 'book',
      label,
    }));

    return items.length > 0 ? items : [{ icon: 'book', label: this.extractKeyPhrase(sentence) }];
  }

  /** Only use an object type the narration actually names. */
  private explicitObjectType(text: string): string | null {
    const lower = text.toLowerCase();
    const types = [
      'book', 'apple', 'globe', 'atom', 'lightbulb', 'calculator', 'pencil', 'star',
      'leaf', 'plant', 'sun', 'water', 'cloud', 'rocket', 'heart', 'cell', 'microscope',
      'brain', 'bone', 'skeleton', 'dna', 'neuron', 'circuit', 'server', 'network',
      'equation', 'chart', 'timeline', 'beaker', 'molecule', 'femur', 'skull', 'ribcage',
    ];
    return types.find((type) => new RegExp(`\\b${type}\\b`, 'i').test(lower)) ?? null;
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
   * Models sometimes put the scene's visual at the root instead of wrapping it
   * in BackgroundScene. The director would fix that later, but structural
   * validation runs first; without this repair every such scene is rejected as
   * "Missing BackgroundScene" and the job makes two extra LLM attempts.
   *
   * The visual is kept, one layer down, and any nested background is promoted to
   * the root so the environment is painted exactly once.
   */
  private ensureBackgroundRoots(storyboard: StoryboardPlan): StoryboardPlan {
    let repaired = 0;
    const scenes = storyboard.scenes.map((scene) => {
      if (scene.component === 'BackgroundScene') return scene;

      const children = [...(scene.children ?? [])];
      const backgroundIndex = children.findIndex(
        (child) => child.component === 'BackgroundScene',
      );
      const background = backgroundIndex >= 0 ? children.splice(backgroundIndex, 1)[0] : undefined;

      repaired++;
      return {
        ...scene,
        component: 'BackgroundScene' as const,
        props: {
          theme: typeof background?.props['theme'] === 'string'
            ? background.props['theme']
            : 'educational',
          ...background?.props,
        },
        children: [
          { component: scene.component, props: { ...scene.props } },
          ...children,
        ],
      };
    });

    if (repaired > 0) {
      console.warn(
        `[Storyboard] Repaired ${repaired} scene root(s) by wrapping visuals in BackgroundScene`,
      );
    }
    return repaired > 0 ? { ...storyboard, scenes } : storyboard;
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
