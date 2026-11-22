import type {
  ContentAnalysis,
  SceneChild,
  SceneInstruction,
  StoryboardPlan,
  VideoConfig,
} from '@edumotion/shared';
import { storyboardValidator } from './storyboard.validation.js';
import { validateMath } from './math.check.js';
import { validateLayout, type LayoutIssue } from './layout.validation.js';
import { validateSubtitles, type SubtitleIssue } from './subtitle.validation.js';
import { validateTiming } from './timing.service.js';

export interface ValidationIssue {
  sceneId?: string;
  severity: 'blocking' | 'warning';
  message: string;
  source: 'content' | 'layout' | 'subtitle' | 'math' | 'structure' | 'claim';
}

export interface ValidationReport {
  passed: boolean;
  blocking: ValidationIssue[];
  warnings: ValidationIssue[];
  checkedAt: string;
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'been', 'were',
  'will', 'into', 'than', 'then', 'they', 'them', 'their', 'there', 'here',
  'its', 'our', 'your', 'you', 'are', 'was', 'but', 'not', 'can', 'could',
  'would', 'should', 'about', 'when', 'where', 'which', 'while', 'what', 'how',
  'why', 'who', 'all', 'any', 'each', 'more', 'most', 'some', 'such', 'very',
  'also', 'just', 'like', 'over', 'under', 'between', 'through', 'because',
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/data:image\/[^\s]+/g, ' ')
    .replace(/[^a-z0-9% ]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

function sceneNarration(scene: SceneInstruction): string {
  const captions = (scene.children ?? [])
    .filter((child) => child.component === 'Subtitle')
    .flatMap((child) =>
      Array.isArray(child.props['entries'])
        ? (child.props['entries'] as Array<{ text?: unknown }>)
        : [],
    )
    .map((entry) => (typeof entry.text === 'string' ? entry.text : ''))
    .join(' ');

  if (captions.trim()) return captions;

  return (scene.children ?? [])
    .flatMap((child) => {
      const text = child.props['text'];
      return typeof text === 'string' ? [text] : [];
    })
    .join(' ');
}

function visualStrings(child: SceneChild): string[] {
  if (child.component === 'Subtitle' || child.component === 'AnimatedText') return [];
  const strings: string[] = [];
  const visit = (value: unknown, depth: number): void => {
    if (depth > 3 || value === null || value === undefined) return;
    if (typeof value === 'string') {
      if (!value.startsWith('data:image/')) strings.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach((item) => visit(item, depth + 1));
    }
  };
  visit(child.props, 0);
  return strings;
}

function relevantKeyTerms(scene: SceneInstruction, analysis: ContentAnalysis): string[] {
  const narration = sceneNarration(scene).toLowerCase();
  const terms = new Set<string>(scene.keyTerms ?? []);
  for (const term of analysis.keyTerms) {
    if ([term.term, ...term.synonyms].some((word) => narration.includes(word.toLowerCase()))) {
      terms.add(term.term);
      for (const synonym of term.synonyms) terms.add(synonym);
    }
  }
  return [...terms];
}

function validateContent(
  storyboard: StoryboardPlan,
  script: string,
  analysis: ContentAnalysis,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const topicTokens = new Set(tokens(`${analysis.topic} ${analysis.domain}`));
  const scriptTokens = new Set(tokens(script));
  const topicHits = [...topicTokens].filter((token) => scriptTokens.has(token)).length;
  if (topicTokens.size > 0 && topicHits / topicTokens.size < 0.2) {
    issues.push({
      source: 'content',
      severity: 'warning',
      message: 'The analysed topic is only weakly represented in the narration.',
    });
  }

  for (const scene of storyboard.scenes) {
    const narration = sceneNarration(scene);
    const narrationTokens = new Set(tokens(narration));
    const terms = relevantKeyTerms(scene, analysis);

    if (!scene.visualBrief) {
      issues.push({
        sceneId: scene.id,
        source: 'content',
        severity: 'warning',
        message: 'Scene has no visualBrief; its visual intent is unclear.',
      });
    }

    for (const term of scene.keyTerms ?? []) {
      if (term.trim() && !narration.toLowerCase().includes(term.toLowerCase())) {
        issues.push({
          sceneId: scene.id,
          source: 'content',
          severity: 'warning',
          message: `Key term "${term}" is not present in this scene's narration.`,
        });
      }
    }

    const visuals = (scene.children ?? []).filter(
      (child) =>
        child.component !== 'Subtitle'
        && child.component !== 'AnimatedText'
        && child.component !== 'EndScreen',
    );
    if (visuals.length === 0) continue;

    const visualTokens = new Set(
      visuals.flatMap((child) => visualStrings(child).flatMap((text) => tokens(text))),
    );
    const known = new Set([...narrationTokens, ...terms.flatMap((term) => tokens(term))]);
    const named = [...visualTokens].filter((token) => known.has(token));
    if (known.size > 0 && named.length === 0) {
      issues.push({
        sceneId: scene.id,
        source: 'content',
        severity: 'warning',
        message: 'The scene visual does not name any concept from its narration or key terms.',
      });
    }
  }

  return issues;
}

function validateUnsupportedClaims(
  storyboard: StoryboardPlan,
  analysis: ContentAnalysis,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const onScreen = storyboard.scenes.flatMap((scene) =>
    (scene.children ?? []).flatMap((child) => visualStrings(child)),
  );
  const onScreenText = onScreen.join(' ').toLowerCase();

  for (const claim of analysis.claims) {
    if (claim.status === 'supported') continue;
    const claimText = claim.text.toLowerCase();
    const mentionsValue = (claim.value ?? '').trim().length > 0
      && onScreenText.includes((claim.value ?? '').toLowerCase());
    if (mentionsValue || claimText.length > 20 && onScreenText.includes(claimText.slice(0, 20))) {
      issues.push({
        source: 'claim',
        severity: 'warning',
        message: `Unverified claim appears on screen: "${claim.text}"`,
      });
    }
  }

  return issues;
}

export function validateVideo(input: {
  storyboard: StoryboardPlan;
  script: string;
  analysis: ContentAnalysis;
  config: VideoConfig;
  audioDurationMs: number;
}): ValidationReport {
  const { storyboard, script, analysis, config, audioDurationMs } = input;
  const issues: ValidationIssue[] = [];

  issues.push(...validateContent(storyboard, script, analysis));
  issues.push(...validateUnsupportedClaims(storyboard, analysis));

  for (const issue of validateMath(storyboard)) {
    issues.push({
      sceneId: issue.sceneId,
      source: 'math',
      severity: 'blocking',
      message: issue.message,
    });
  }

  for (const issue of validateLayout(storyboard, config.width, config.height) as LayoutIssue[]) {
    issues.push({ ...issue, source: 'layout' });
  }

  for (const issue of validateSubtitles(storyboard, audioDurationMs) as SubtitleIssue[]) {
    issues.push({ ...issue, source: 'subtitle' });
  }

  for (const message of validateTiming(storyboard)) {
    issues.push({ source: 'structure', severity: 'blocking', message });
  }

  const structure = storyboardValidator.validate(storyboard, script);
  for (const message of structure.overallIssues) {
    issues.push({ source: 'structure', severity: 'warning', message });
  }

  const blocking = issues.filter((issue) => issue.severity === 'blocking');
  const warnings = issues.filter((issue) => issue.severity === 'warning');

  return {
    passed: blocking.length === 0,
    blocking,
    warnings,
    checkedAt: new Date().toISOString(),
  };
}
