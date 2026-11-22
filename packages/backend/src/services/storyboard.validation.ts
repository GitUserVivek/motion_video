import type { StoryboardPlan, SceneInstruction, SceneChild, ComponentName } from '@edumotion/shared';
import { StoryboardValidationSchema, SceneValidationSchema } from '@edumotion/shared';
import { z } from 'zod';

/**
 * Validates storyboard quality and educational effectiveness.
 *
 * Relevance is measured as *coverage*: how much of what is on screen is named by
 * the narration the scene is speaking. That is deliberately stricter than the
 * old `script.includes(type)` check, which scored 0.25 for a perfectly sensible
 * diagram whose words simply were not spelled the same way, and it does not
 * count the title as the visual explanation.
 */

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'been', 'were',
  'will', 'into', 'than', 'then', 'they', 'them', 'their', 'there', 'here',
  'its', 'our', 'your', 'you', 'are', 'was', 'but', 'not', 'can', 'could',
  'would', 'should', 'about', 'when', 'where', 'which', 'while', 'what', 'how',
  'why', 'who', 'all', 'any', 'each', 'more', 'most', 'some', 'such', 'very',
  'also', 'just', 'like', 'over', 'under', 'between', 'through', 'because',
  'these', 'those', 'one', 'two', 'use', 'uses', 'used', 'make', 'makes',
  'made', 'get', 'gets', 'got', 'has', 'had', 'does', 'did', 'doing', 'being',
]);

/**
 * Words that name the same idea. A leaf diagram *is* relevant to sentences about
 * photosynthesis even though the sentence never says "leaf".
 */
const CONCEPT_ALIASES: Record<string, string[]> = {
  leaf: ['plant', 'plants', 'photosynthesis', 'chlorophyll', 'glucose', 'oxygen'],
  plant: ['leaf', 'leaves', 'photosynthesis', 'root', 'stem', 'grow'],
  sun: ['sunlight', 'solar', 'light', 'energy', 'day'],
  water: ['liquid', 'rain', 'ocean', 'river', 'droplet', 'steam', 'ice'],
  cloud: ['weather', 'sky', 'vapour', 'vapor', 'condensation', 'rain'],
  heart: ['blood', 'pump', 'pumping', 'circulation', 'oxygen', 'beat'],
  brain: ['neuron', 'neurons', 'mind', 'thinking', 'signals', 'memory'],
  cell: ['dna', 'gene', 'nucleus', 'biology', 'organism', 'membrane', 'liver', 'enzyme', 'intestine', 'stomach', 'digestion', 'nutrient', 'protein', 'food'],
  apple: ['food', 'nutrition', 'eat', 'healthy', 'diet', 'ingredient', 'recipe', 'digestion'],
  atom: ['molecule', 'electron', 'proton', 'neutron', 'chemical', 'reaction'],
  circuit: ['chip', 'processor', 'electric', 'current', 'transistor', 'silicon'],
  server: ['database', 'computer', 'network', 'data', 'storage', 'cloud'],
  network: ['internet', 'router', 'server', 'connection', 'protocol', 'data'],
  gear: ['machine', 'engine', 'mechanism', 'motor', 'process'],
  book: ['read', 'reading', 'story', 'knowledge', 'history', 'learn'],
  calculator: ['number', 'math', 'maths', 'equation', 'calculate', 'sum'],
  rocket: ['space', 'launch', 'planet', 'orbit', 'astronaut', 'thrust'],
  microscope: ['lab', 'laboratory', 'experiment', 'specimen', 'microbe'],
  bone: ['skeleton', 'skull', 'femur', 'rib', 'joint', 'calcium'],
  skeleton: ['bone', 'bones', 'skull', 'ribcage', 'femur', 'body'],
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9% ]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

export class StoryboardValidator {

  /**
   * Validate entire storyboard for quality
   */
  validate(storyboard: StoryboardPlan, script: string): z.infer<typeof StoryboardValidationSchema> {
    const sceneResults: z.infer<typeof SceneValidationSchema>[] = [];
    const overallIssues: string[] = [];
    const recommendations: string[] = [];
    let validScenes = 0;

    for (const scene of storyboard.scenes) {
      const result = this.validateScene(scene, script);
      sceneResults.push(result);
      if (result.isValid) validScenes++;

      overallIssues.push(...result.issues.map((issue) => `${scene.id}: ${issue}`));
      recommendations.push(...result.warnings.map((warning) => `${scene.id}: ${warning}`));
    }

    const storyboardIssues = this.validateStoryboardStructure(storyboard);
    overallIssues.push(...storyboardIssues);

    recommendations.push(...this.validateEducationalFlow(storyboard, script));

    return StoryboardValidationSchema.parse({
      isValid: validScenes === storyboard.scenes.length && storyboardIssues.length === 0,
      totalScenes: storyboard.scenes.length,
      validScenes,
      sceneResults,
      overallIssues,
      recommendations,
    });
  }

  private validateScene(scene: SceneInstruction, script: string): z.infer<typeof SceneValidationSchema> {
    const issues: string[] = [];
    const warnings: string[] = [];

    const hasBackground = scene.component === 'BackgroundScene'
      || (scene.children?.some((child) => child.component === 'BackgroundScene') ?? false);
    const hasVisual = this.hasEducationalVisual(scene);
    const hasText = this.hasTextComponent(scene);
    const hasSubtitle = this.hasSubtitleComponent(scene);

    if (!hasBackground) issues.push('Missing BackgroundScene component');
    if (!hasVisual) issues.push('Missing educational visual component');
    if (!hasText) warnings.push('No title text for the main concept');
    if (!hasSubtitle) warnings.push('No Subtitle component');

    let visualRelevance = 0;
    if (hasVisual) {
      visualRelevance = this.calculateVisualRelevance(scene, script);
      if (visualRelevance < 0.5) {
        issues.push(
          `Low visual relevance (${visualRelevance.toFixed(2)}): the visuals do not name what the narration is about`,
        );
      } else if (visualRelevance < 0.7) {
        warnings.push(`Visual relevance could be improved (${visualRelevance.toFixed(2)})`);
      }
    }

    const duration = scene.endFrame - scene.startFrame;
    if (duration < 30) {
      warnings.push(`Scene is very short (${duration} frames)`);
    } else if (duration > 450) {
      warnings.push(`Scene is very long (${duration} frames)`);
    }

    if (!this.hasAnimation(scene)) {
      warnings.push('No animated element in the scene');
    }

    return SceneValidationSchema.parse({
      sceneId: scene.id,
      isValid: issues.length === 0,
      issues,
      warnings,
      hasVisual,
      hasText,
      hasSubtitle,
      visualRelevance: hasVisual ? visualRelevance : 0,
    });
  }

  private hasEducationalVisual(scene: SceneInstruction): boolean {
    const visualComponents = this.visualComponentNames();
    if (visualComponents.includes(scene.component)) return true;
    return scene.children?.some((child) => visualComponents.includes(child.component)) ?? false;
  }

  private hasTextComponent(scene: SceneInstruction): boolean {
    return scene.children?.some((child) => child.component === 'AnimatedText') ?? false;
  }

  private hasSubtitleComponent(scene: SceneInstruction): boolean {
    return scene.children?.some((child) => child.component === 'Subtitle') ?? false;
  }

  private hasAnimation(scene: SceneInstruction): boolean {
    if (scene.props['animation']) return true;
    return scene.children?.some((child) =>
      child.props['animation'] !== undefined || child.props['startFrame'] !== undefined) ?? false;
  }

  /** Components that depict the topic (titles and captions are separate layers). */
  private visualComponentNames(): ComponentName[] {
    return [
      'EducationalObject', 'ObjectGroup', 'ConceptDiagram', 'MultiplicationTable',
      'ImageScene', 'Character', 'Teacher', 'SplitScreenComparison',
      'ProcessFlow', 'Timeline', 'HighlightedRegion', 'AnimatedDiagram',
      'NumberCounter', 'ObjectZoom', 'Callout', 'EndScreen', 'QuestionCard',
      'SpeechBubble', 'AnnotatedCallout', 'ComparisonChart', 'SummaryScene',
    ];
  }

  private getVisualComponents(scene: SceneInstruction): SceneChild[] {
    const names = this.visualComponentNames();
    const result: SceneChild[] = [];

    if (names.includes(scene.component)) {
      result.push({ component: scene.component, props: scene.props });
    }
    for (const child of scene.children ?? []) {
      if (names.includes(child.component)) result.push(child);
    }
    return result;
  }

  /** The narration this scene is speaking, from its own caption cue. */
  private sceneNarration(scene: SceneInstruction): string {
    const subtitle = scene.children?.find((child) => child.component === 'Subtitle');
    const entries = subtitle?.props['entries'];
    if (!Array.isArray(entries)) return '';

    return entries
      .map((entry) =>
        typeof entry === 'object' && entry !== null
          ? (entry as { text?: unknown }).text
          : undefined,
      )
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
      .trim();
  }

  /**
   * Every word the visual puts on screen: object type, labels, titles and the
   * text of diagram tiles / flow steps.
   */
  private descriptorTokens(child: SceneChild): string[] {
    const words: string[] = [];

    const push = (value: unknown): void => {
      if (typeof value === 'string') words.push(...tokenize(value));
    };

    push(child.props['type']);
    push(child.props['label']);
    push(child.props['title']);
    push(child.props['text']);
    push(child.props['question']);

    for (const key of ['items', 'steps', 'milestones', 'points', 'values', 'bars', 'events']) {
      const list = child.props[key];
      if (!Array.isArray(list)) continue;
      for (const entry of list.slice(0, 8)) {
        if (typeof entry !== 'object' || entry === null) continue;
        const record = entry as Record<string, unknown>;
        push(record['label']);
        push(record['type']);
        push(record['text']);
        push(record['title']);
        push(record['date']);
      }
    }

    // ImageScene paths carry the concept in the file name.
    const src = child.props['src'];
    if (typeof src === 'string' && !src.startsWith('data:')) {
      push(src.split('/').pop()?.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '));
    }

    return [...new Set(words)].slice(0, 12);
  }

  private isNamedBy(token: string, narration: Set<string>): boolean {
    if (narration.has(token)) return true;
    return (CONCEPT_ALIASES[token] ?? []).some((alias) => narration.has(alias));
  }

  /**
   * 0-1 score: share of the visual's own words that the scene's narration also
   * uses (directly or through a concept alias). A visual contributes a small
   * base because it is in-frame support, and full credit when everything it
   * names is being talked about.
   */
  private calculateVisualRelevance(scene: SceneInstruction, script: string): number {
    const visuals = this.getVisualComponents(scene);
    if (visuals.length === 0) return 0;

    const narration = new Set(tokenize(this.sceneNarration(scene) || script));
    let total = 0;

    for (const visual of visuals) {
      const words = this.descriptorTokens(visual);
      if (words.length === 0) {
        // Structural visual (e.g. a bare timeline): nothing to compare against.
        total += 0.5;
        continue;
      }

      const named = words.filter((word) => this.isNamedBy(word, narration)).length;
      total += 0.35 + 0.65 * (named / words.length);
    }

    return Math.min(1, total / visuals.length);
  }

  private validateStoryboardStructure(storyboard: StoryboardPlan): string[] {
    const issues: string[] = [];
    const scenes = storyboard.scenes;

    for (let i = 0; i < scenes.length - 1; i++) {
      const current = scenes[i];
      const next = scenes[i + 1];
      if (!current || !next) continue;
      if (current.endFrame !== next.startFrame) {
        issues.push(
          `Frame gap between ${current.id} (ends ${current.endFrame}) and ${next.id} (starts ${next.startFrame})`,
        );
      }
    }

    const firstScene = scenes[0];
    if (firstScene && firstScene.startFrame !== 0) {
      issues.push(`First scene should start at frame 0, but starts at ${firstScene.startFrame}`);
    }

    const lastScene = scenes[scenes.length - 1];
    if (lastScene && lastScene.endFrame !== storyboard.totalFrames) {
      issues.push(
        `Last scene should end at totalFrames (${storyboard.totalFrames}), but ends at ${lastScene.endFrame}`,
      );
    }

    // The video has to close on a designed ending, on the final scene itself.
    const endsWithEndScreen = lastScene !== undefined
      && (lastScene.component === 'EndScreen'
        || (lastScene.children?.some((child) => child.component === 'EndScreen') ?? false));
    if (!endsWithEndScreen) {
      issues.push('Final scene must contain an EndScreen component');
    }

    return issues;
  }

  private validateEducationalFlow(storyboard: StoryboardPlan, script: string): string[] {
    const recommendations: string[] = [];
    const sentences = script.split('\n').filter((line) => line.trim().length > 0);

    if (storyboard.scenes.length > sentences.length * 2) {
      recommendations.push(
        `Too many scenes (${storyboard.scenes.length}) for ${sentences.length} script lines`,
      );
    } else if (storyboard.scenes.length < Math.ceil(sentences.length / 2)) {
      recommendations.push(
        `Too few scenes (${storyboard.scenes.length}) for ${sentences.length} script lines`,
      );
    }

    const visualTypes = new Set<string>();
    for (const scene of storyboard.scenes) {
      for (const visual of this.getVisualComponents(scene)) visualTypes.add(visual.component);
    }
    if (visualTypes.size < 3) {
      recommendations.push(
        `Low visual variety: only ${visualTypes.size} visual component type(s) used`,
      );
    }

    const palettes = new Set<string>();
    for (const scene of storyboard.scenes) {
      const palette = scene.props['palette'];
      if (typeof palette === 'string') palettes.add(palette);
    }
    if (storyboard.scenes.length > 2 && palettes.size < 2) {
      recommendations.push('Every scene shares one background palette');
    }

    for (let i = 0; i < storyboard.scenes.length - 1; i++) {
      const currentScene = storyboard.scenes[i];
      const nextScene = storyboard.scenes[i + 1];
      if (!currentScene || !nextScene) continue;

      const currentVisuals = this.getVisualComponents(currentScene).map((child) => child.component);
      const nextVisuals = this.getVisualComponents(nextScene).map((child) => child.component);
      const repeated = currentVisuals.filter((name) => nextVisuals.includes(name));

      if (repeated.length > 1) {
        recommendations.push(
          `${currentScene.id} and ${nextScene.id} use similar visuals (${repeated.join(', ')})`,
        );
      }
    }

    return recommendations;
  }
}

export const storyboardValidator = new StoryboardValidator();
