import {
  isEnglish,
  pickScenePalette,
  resolveInstructor,
  type ComponentName,
  type PaletteId,
  type SceneChild,
  type SceneInstruction,
  type StoryboardPlan,
} from '@edumotion/shared';
import { pickTopicObject } from './storyboard.visuals.js';
import { normalizeForComparison } from './text.language.js';

/**
 * Deterministic visual direction applied *after* the model produced a
 * structurally valid storyboard.
 *
 * The LLM is good at deciding what a scene should teach and poor at keeping a
 * video visually alive: every scene came back as the same dark background with
 * an icon and a paragraph of narration as the title. Those are exactly the
 * things that can be decided without a model, so they are decided here:
 *
 *  - one background palette per scene, never the same as the previous scene;
 *  - a rotating background pattern and camera move;
 *  - a short heading instead of the whole narration;
 *  - an EducationalObject whose type actually appears in the narration;
 *  - an EndScreen on the final scene.
 *
 * Everything is a pure function of the storyboard + script, so renders stay
 * reproducible.
 */

const PATTERN_CYCLE = ['none', 'dots', 'grid', 'waves'] as const;
const CAMERA_CYCLE = ['zoomIn', 'panRight', 'zoomOut', 'panLeft'] as const;

/** Closing titles keyed by topic; the first match wins. */
const TOPIC_TITLES: ReadonlyArray<[RegExp, string]> = [
  [/\b(photosynthes\w*|chlorophyll|leaves?|plants?)\b/i, 'Now You Know How Plants Make Food'],
  [/\b(heart|blood|circulat\w*)\b/i, 'Now You Know How Your Heart Works'],
  [/\b(artificial intelligence|machine learning|\bai\b|neural network)\b/i, 'Now You Know How AI Learns'],
  [/\b(cpu|processor|computer|memory|hardware)\b/i, 'Now You Know What Happens Inside a Computer'],
  [/\b(space|planet|solar system|orbit|rocket)\b/i, 'Now You Know How Space Works'],
  [/\b(atom|molecule|chemical|reaction)\b/i, 'Now You Know the Chemistry Behind It'],
  [/\b(numbers?|maths?|fractions?|equations?)\b/i, 'Now You Know the Maths Behind It'],
];

/**
 * Narration intents the director can turn into a composition. They are read from
 * the words the scene is actually speaking, never guessed from the topic, so the
 * same script always produces the same visual shape.
 */
type CompositionIntent =
  | 'summary'
  | 'comparison'
  | 'timeline'
  | 'process'
  | 'data'
  | 'definition'
  | 'hook';

interface Composition {
  intent: CompositionIntent;
  child: SceneChild;
  /** Components this composition makes redundant, so two visuals never stack. */
  replace: ReadonlySet<ComponentName>;
}

const INTENT_CUES: ReadonlyArray<{ intent: CompositionIntent; pattern: RegExp }> = [
  {
    intent: 'summary',
    pattern: /\b(in short|in summary|to sum up|to recap|recap|remember that|key takeaway|all together|now you know)\b/i,
  },
  {
    intent: 'comparison',
    pattern: /\b(vs\.?|versus|compared (?:to|with)|unlike|whereas|while|instead of|rather than|more than|less than|better than|faster than|slower than)\b/i,
  },
  {
    // More specific than `timeline`: a sentence full of measured values is a
    // comparison, even when it also mentions a year.
    // No trailing `\b`: `%` is not a word character, so a boundary check after it
    // would reject every percentage in the narration.
    intent: 'data',
    pattern: /\b\d+(?:\.\d+)?\s*(?:%|percent|million|billion|thousand|km|kg|calories?|degrees?|times|x)(?![a-z])/i,
  },
  {
    intent: 'timeline',
    pattern: /\b(centur(?:y|ies)|decades?|years? ago|ancient|medieval|prehistoric|historically)\b|\b(?:1[0-9]{3}|20[0-2][0-9])s?\b/i,
  },
  {
    intent: 'process',
    pattern: /\b(at first|first|then|next|after that|finally|lastly|step \d|starts?|begins?|becomes|turns? into|takes? in|creates?|builds?|makes?|produces?|releases?|absorbs?|converts?)\b/i,
  },
  {
    intent: 'definition',
    pattern: /\b(is called|are called|called|known as|means|refers to|defined as|is a type of)\b/i,
  },
  {
    intent: 'hook',
    pattern: /\b(have you ever|imagine|what if|did you know)\b|\?/,
  },
];

/** Every component that owns the visual area of a scene. */
const PRIMARY_VISUALS: ReadonlyArray<ComponentName> = [
  'ConceptDiagram', 'ObjectGroup', 'EducationalObject', 'ImageScene',
  'SplitScreenComparison', 'ComparisonChart', 'AnnotatedCallout',
  'ProcessFlow', 'Timeline', 'SummaryScene', 'AnimatedDiagram',
  'AnimatedNumber', 'NumberCounter', 'MultiplicationTable', 'HighlightedRegion',
  'ObjectZoom', 'Callout', 'QuestionCard', 'KineticTypography',
];

/** Visuals that already use the whole middle lane of the frame. */
const FULL_WIDTH_VISUALS: ReadonlySet<ComponentName> = new Set<ComponentName>([
  'ProcessFlow', 'Timeline', 'SplitScreenComparison', 'AnnotatedCallout',
  'ComparisonChart', 'SummaryScene', 'AnimatedDiagram', 'ConceptDiagram',
  'ImageScene', 'MultiplicationTable', 'HighlightedRegion',
]);

/** Every primary visual is replaced when a better composition owns the scene. */
function replacePrimaryVisuals(): Set<ComponentName> {
  return new Set(PRIMARY_VISUALS);
}

/** Labels that describe a scene's role, not a title a viewer should read. */
const GENERIC_PURPOSES = new Set([
  'hook', 'recap', 'summary', 'ending', 'conclusion', 'intro', 'introduction',
  'process', 'data', 'example', 'define', 'definition', 'compare',
  'comparison', 'teaching', 'content', 'body',
]);

/** A title must not start with a conjunction or a relative pronoun. */
const BAD_TITLE_START =
  /^(and|but|so|because|which|that|these|those|they|them|it|its|this|where|when|while|who|whom|whose|as|if|then|than)\b/i;
const DANGLING_END =
  /(?:[,;:\-–—]|\b(?:and|but|so|because|which|while|that|by|in|at|to|of|the|a|an|with|for|from|as))$/i;
const DANGLING_END_MR =
  /(?:[,;:\-–—]|(?:आणि|व|पण|परंतु|म्हणून|कारण|म्हणजे|की|जे|जी|ते|त्या|हे|ही|या|असलेले|असलेला|असलेली|चा|ची|चे|ला|ली|ने|मध्ये))$/u;

const DIRECTOR_STOPWORDS = new Set<string>([
  'the', 'a', 'an', 'and', 'or', 'but', 'so', 'because', 'if', 'then', 'than', 'that', 'this',
  'these', 'those', 'there', 'here', 'when', 'what', 'which', 'who', 'how', 'why', 'where',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am', 'do', 'does', 'did', 'has', 'have',
  'had', 'it', 'its', 'they', 'them', 'their', 'you', 'your', 'we', 'our', 'i', 'my', 'me',
  'he', 'she', 'his', 'her', 'him', 'us', 'of', 'to', 'in', 'on', 'at', 'for', 'from', 'with',
  'by', 'as', 'about', 'into', 'over', 'under', 'up', 'down', 'out', 'off', 'will', 'would',
  'can', 'could', 'should', 'may', 'might', 'must', 'not', 'no', 'yes', 'just', 'also', 'very',
  'only', 'like', 'more', 'most', 'some', 'any', 'all', 'each', 'every', 'one', 'two', 'let',
  'lets', 'get', 'gets', 'got', 'make', 'makes', 'made', 'see', 'say', 'says', 'said', 'know',
  'knows', 'think', 'thinks', 'mean', 'means', 'called', 'known', 'become', 'becomes', 'turns',
  'starts', 'start', 'uses', 'use', 'used', 'takes', 'take', 'taking', 'away', 'first', 'next',
  'finally', 'example', 'imagine', 'suppose', 'now', 'still', 'even', 'another', 'thing', 'things',
  'something', 'everything', 'nothing', 'here', 'there', 'where', 'while', 'through', 'between',
]);

/** Words a scene is actually about, in reading order. */
function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9%\- ]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !DIRECTOR_STOPWORDS.has(word) && !/^[\d%.,-]+$/.test(word));
}

function titleCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Up to `limit` distinct content words, capitalised, for annotation labels. */
function keyTerms(text: string, limit: number): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const word of contentWords(text)) {
    if (seen.has(word)) continue;
    seen.add(word);
    terms.push(titleCase(word));
    if (terms.length >= limit) break;
  }
  return terms;
}

/**
 * Strip the punctuation and dangling conjunctions a raw split leaves behind, so
 * a step never reads "it takes in water, and" and a card never reads
 * "Europe, and in". A split can end in a trailing space, so the trims repeat
 * until the label stops changing.
 */
function tidyLabel(text: string): string {
  const connector = /[,\s]+(?:and|but|so|which|while|that|because|by|in|at|to|of|the)$/i;
  let label = text.replace(/\s+/g, ' ').replace(/^[^A-Za-z0-9]+/, '').trim();
  let previous = '';

  while (label !== previous) {
    previous = label;
    label = label.replace(/[,;:]+$/, '').trim().replace(connector, '').trim();
  }

  return label;
}

/**
 * Narration cut into the clauses a process flow or recap can show.
 *
 * Every clause is kept whole. Cutting a clause to a character budget put an
 * ellipsis in the middle of a sentence a viewer is reading ("do you know why
 * the..."); the cards wrap and grow instead, so nothing is hidden.
 */
function clauses(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?;:])\s+|\s+(?:then|next|after that|finally|lastly)\s+/i)
    .map((part) => tidyLabel(part))
    .filter((part) => part.replace(/[^A-Za-z0-9]/g, '').length >= 3);
}

const MEASUREMENT_RE =
  /(\d+(?:\.\d+)?)\s*(%|percent|million|billion|thousand|km|kg|kilometres?|kilometers?|calories?|degrees?|°|times|x)(?![a-z])/gi;

interface ChartBar {
  label: string;
  value: number;
  suffix?: string;
}

function unitSuffix(unit: string): string {
  const lower = unit.toLowerCase();
  if (lower === '%' || lower === 'percent') return '%';
  if (lower === 'million') return 'M';
  if (lower === 'billion') return 'B';
  if (lower === 'thousand') return 'K';
  if (lower === 'times' || lower === 'x') return '×';
  if (lower === '°' || lower.startsWith('degree')) return '°';
  if (lower.startsWith('kilomet') || lower === 'km') return 'km';
  if (lower === 'kg') return 'kg';
  if (lower.startsWith('calorie')) return ' cal';
  return '';
}

/**
 * Measured values from the narration, grouped by unit. Comparing "30%" against
 * "2 million" on one axis would be meaningless, so only the largest single-unit
 * group is charted, and it needs at least two values.
 */
/**
 * Name a value from the words around it: the noun that follows the number first,
 * then the words before it. Repeated labels get the next distinct phrase, so two
 * bars never carry the same caption.
 */
function measurementLabel(text: string, match: RegExpExecArray, used: Set<string>): string {
  const after = contentWords(text.slice(match.index + match[0].length).split(/[.;!?]/)[0] ?? '');
  const before = contentWords(text.slice(Math.max(0, match.index - 44), match.index));

  const candidates = [
    after.slice(0, 2).join(' '),
    after[0] ?? '',
    before.slice(-2).join(' '),
    before[before.length - 1] ?? '',
  ].filter((candidate) => candidate.length > 0);

  const label = candidates.find((candidate) => !used.has(candidate.toLowerCase()))
    ?? `Value ${used.size + 1}`;
  used.add(label.toLowerCase());
  return titleCase(label);
}

function measurements(text: string): ChartBar[] {
  const groups = new Map<string, ChartBar[]>();
  const used = new Set<string>();
  const re = new RegExp(MEASUREMENT_RE.source, 'gi');
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const value = Number(match[1]);
    if (!Number.isFinite(value) || value <= 0) continue;

    const suffix = unitSuffix(match[2] ?? '');
    const bars = groups.get(suffix) ?? [];
    if (bars.length >= 4) continue;

    bars.push({
      label: measurementLabel(text, match, used),
      value,
      ...(suffix ? { suffix } : {}),
    });
    groups.set(suffix, bars);
  }

  let best: ChartBar[] = [];
  for (const bars of groups.values()) {
    if (bars.length > best.length) best = bars;
  }
  return best.length >= 2 ? best : [];
}

/** Two sides of a comparison, when the narration states one. */
function comparisonSides(narration: string): { left: string; right: string } | null {
  const parts = narration
    .split(/\b(?:vs\.?|versus|unlike|whereas|while|compared (?:to|with)|instead of|rather than)\b/i)
    .map((part) => part.trim())
    .filter((part) => contentWords(part).length > 0);
  if (parts.length < 2) return null;

  const left = tidyLabel(parts[0] ?? '');
  const right = tidyLabel(parts.slice(1).join(' '));
  return left && right ? { left, right } : null;
}

const DATE_RE = /\b(\d{1,2}(?:st|nd|rd|th)\s+century|centuries\s+ago|(?:the\s+)?\d{3,4}s?)\b/gi;

/** Dated moments, each with the phrase that follows it as its title. */
function timelineEvents(narration: string): Array<{ date: string; title: string }> {
  const events: Array<{ date: string; title: string }> = [];
  const re = new RegExp(DATE_RE.source, 'gi');
  let match: RegExpExecArray | null;

  while ((match = re.exec(narration)) !== null && events.length < 4) {
    const rest = narration.slice(re.lastIndex);
    // Stop at the next date too: an event card must not quote the following
    // event's year.
    const nextDate = rest.search(new RegExp(DATE_RE.source, 'i'));
    const piece = nextDate >= 0 ? rest.slice(0, nextDate) : rest;
    const title = tidyLabel(piece.split(/[.;!?]/)[0] ?? '');
    if (!title) continue;
    events.push({
      date: (match[0] ?? '').replace(/^the\s+/i, '').trim(),
      title,
    });
  }

  return events;
}

/** The object the scene already shows, reused as the annotated subject. */
function subjectOf(children: SceneChild[]): { subject?: string; image?: string } {
  for (const child of children) {
    if (child.component === 'EducationalObject') {
      const type = child.props['type'];
      const image = child.props['image'];
      return {
        ...(typeof type === 'string' ? { subject: type } : {}),
        ...(typeof image === 'string' && image.startsWith('data:image/') ? { image } : {}),
      };
    }

    if (child.component === 'ConceptDiagram') {
      const items = child.props['items'];
      const first = Array.isArray(items) ? items[0] : undefined;
      if (first && typeof first === 'object') {
        const record = first as Record<string, unknown>;
        const icon = record['icon'];
        const image = record['image'];
        return {
          ...(typeof icon === 'string' ? { subject: icon } : {}),
          ...(typeof image === 'string' && image.startsWith('data:image/') ? { image } : {}),
        };
      }
    }
  }
  return {};
}

function detectIntent(narration: string): CompositionIntent | null {
  if (narration.trim().length < 12) return null;
  for (const cue of INTENT_CUES) {
    if (cue.pattern.test(narration)) return cue.intent;
  }
  return null;
}

/**
 * Turn the scene's narration into the composition that explains it best. Every
 * prop is derived from the scene's own words, so the composition also scores as
 * relevant to the narration it illustrates.
 */
function buildComposition(
  intent: CompositionIntent,
  narration: string,
  scene: SceneInstruction,
  children: SceneChild[],
): Composition | null {
  // Child timings are scene-relative; the renderer adds the scene offset once.
  const startFrame = 10;

  switch (intent) {
    case 'summary': {
      const points = clauses(narration).slice(0, 4);
      if (points.length < 2) return null;
      return {
        intent,
        replace: replacePrimaryVisuals(),
        child: {
          component: 'SummaryScene',
          props: {
            title: 'In short',
            badgeText: 'Recap',
            points,
            accent: '#FFD166',
            top: '58%',
            left: '50%',
            startFrame,
          },
        },
      };
    }

    case 'comparison':
    case 'data': {
      const bars = measurements(narration);
      if (bars.length >= 2) {
        return {
          intent,
          replace: replacePrimaryVisuals(),
          child: {
            component: 'ComparisonChart',
            props: {
              title: (narration.split(/[.!?।॥]/)[0] ?? '').trim(),
              bars,
              accent: '#FFD166',
              top: '56%',
              left: '50%',
              startFrame,
            },
          },
        };
      }

      if (intent === 'comparison') {
        const sides = comparisonSides(narration);
        if (!sides) return null;
        return {
          intent,
          replace: replacePrimaryVisuals(),
          child: {
            component: 'SplitScreenComparison',
            props: {
              left: { content: sides.left },
              right: { content: sides.right },
              comparisonLabel: 'vs',
              startFrame,
            },
          },
        };
      }
      return null;
    }

    case 'timeline': {
      const events = timelineEvents(narration);
      if (events.length < 2) return null;
      return {
        intent,
        replace: replacePrimaryVisuals(),
        child: {
          component: 'Timeline',
          props: { events, top: '58%', left: '50%', width: 880, startFrame },
        },
      };
    }

    case 'process': {
      const steps = clauses(narration).slice(0, 4);
      if (steps.length < 2) return null;
      return {
        intent,
        replace: replacePrimaryVisuals(),
        child: {
          component: 'ProcessFlow',
          props: {
            steps: steps.map((label) => ({ label })),
            direction: steps.length > 2 ? 'vertical' : 'horizontal',
            top: '54%',
            left: '50%',
            stepSpacing: 96,
            startFrame,
          },
        },
      };
    }

    case 'definition': {
      const terms = keyTerms(narration, 3);
      if (terms.length === 0) return null;

      // Dots sit on the subject's own body; cards live in the outer margins.
      const dots = [
        { x: 40, y: 43 },
        { x: 60, y: 47 },
        { x: 47, y: 61 },
      ];
      const points = terms.map((label, index) => ({ label, ...(dots[index] ?? { x: 50, y: 50 }) }));
      // Reuse the object the scene already shows; if there is none, draw the
      // concept the narration names rather than a generic book.
      const found = subjectOf(children);

      return {
        intent,
        replace: replacePrimaryVisuals(),
        child: {
          component: 'AnnotatedCallout',
          props: {
            ...found,
            subject: found.subject ?? pickTopicObject(narration),
            points,
            accent: '#FFD166',
            startFrame,
          },
        },
      };
    }

    case 'hook': {
      // A bubble is only justified by a real question. "Imagine…" used to make
      // a bubble that repeated the caption word for word.
      const question = narration
        .split(/(?<=[.!?।॥])\s+/)
        .find((part) => part.includes('?'));
      if (!question) return null;
      const text = question.trim();
      if (!text) return null;
      return {
        intent,
        // An annotation never replaces the scene's primary visual; it is
        // dropped later if the scene already owns the middle lane.
        replace: new Set<ComponentName>(),
        child: {
          component: 'SpeechBubble',
          props: {
            text,
            variant: 'question',
            tail: 'left',
            top: '66%',
            left: '50%',
            width: 820,
            fontSize: 36,
            accent: '#FFD166',
            startFrame,
          },
        },
      };
    }

    default:
      return null;
  }
}

export interface DirectedStoryboard {
  storyboard: StoryboardPlan;
  /** Human-readable list of what the director changed, for the job log. */
  changes: string[];
}

/** Comparison key for "is this the same sentence?" checks. */
function normalizeText(text: string): string {
  return normalizeForComparison(text);
}

/**
 * True when two strings say the same thing, including the case where the title
 * is a truncated prefix of the sentence (the old `shorten()` output).
 */
function isDuplicateText(a: string, b: string): boolean {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return shorter.length >= 18 && longer.startsWith(shorter);
}

/** Caption text shown in this scene, used for duplicate-speech checks. */
function subtitleCueTexts(children: SceneChild[]): string[] {
  return children
    .filter((child) => child.component === 'Subtitle')
    .flatMap((child) => {
      const entries = child.props['entries'];
      if (!Array.isArray(entries)) return [];
      return entries
        .map((entry) =>
          typeof entry === 'object' && entry !== null
            ? (entry as { text?: unknown }).text
            : undefined,
        )
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    });
}

/**
 * A title cut at a clause/word boundary, never with an ellipsis. A heading is
 * allowed to be shorter than the sentence; it is not allowed to look cut off.
 */
function semanticTitle(text: string, maxWords = 8): string {
  const clean = text.replace(/\s+/g, ' ').replace(/^[^A-Za-z0-9]+/, '').trim();
  if (!clean) return '';

  const clause = clean.split(/[.!?;:]/)[0] ?? clean;
  const words = clause.split(/\s+/).filter(Boolean);
  if (words.length < 2) return '';

  const cut = words.length > maxWords ? words.slice(0, maxWords) : [...words];
  while (cut.length > 2 && DANGLING_END.test(cut[cut.length - 1] ?? '')) cut.pop();
  return cut.join(' ').replace(/[,;:\-–—]+$/, '').trim();
}

/**
 * Closing-screen copy per language. The English strings are the component's own
 * defaults; a Marathi video must never show them.
 */
const END_SCREEN_COPY = {
  en: {
    title: 'Thanks for watching!',
    subtitle: 'Keep exploring with Anupam Classes',
    recapPrefix: 'In short: ',
    kicker: 'RECAP',
  },
  mr: {
    title: 'पाहिल्याबद्दल धन्यवाद!',
    subtitle: 'Anupam Classes सोबत शिकत राहा',
    recapPrefix: 'थोडक्यात: ',
    kicker: 'सारांश',
  },
} as const;

const END_SCREEN_DEFAULTS = {
  title: 'Thanks for Watching!',
  subtitle: 'Subscribe for more educational videos',
  kicker: 'RECAP',
};

/**
 * A model-written title in a non-English script. The English checks below test
 * English conjunctions and word counts; this one only rejects something that is
 * obviously not a heading (a cut-off phrase or a whole paragraph).
 */
function isUsableTitle(text: string): boolean {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean || clean.endsWith('…')) return false;
  if (clean.length > 90) return false;
  if (/[,;:\-–—]$/.test(clean) || DANGLING_END_MR.test(clean)) return false;
  const words = clean.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 12;
}

/** Whether a model-written line reads as a title rather than a caption cut-off. */
function isGoodTitle(text: string): boolean {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean || clean.endsWith('…')) return false;
  if (clean.length > 64) return false;
  if (BAD_TITLE_START.test(clean)) return false;
  if (DANGLING_END.test(clean) || DANGLING_END_MR.test(clean)) return false;
  const words = clean.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 9;
}

/**
 * Semantic heading, in the plan's order: explicit model title, visual brief,
 * purpose + key terms, otherwise nothing. Narration is deliberately not
 * truncated into a heading any more.
 */
function sceneHeading(
  scene: SceneInstruction,
  existingTitle?: string,
  english = true,
): string | null {
  if (existingTitle) {
    const clean = existingTitle.replace(/\s+/g, ' ').trim();
    if (english ? isGoodTitle(clean) : isUsableTitle(clean)) return clean;
  }

  // Everything below composes an English phrase ("Explained", "vs", purpose
  // names), so a Marathi video keeps the model's own heading or none at all.
  if (!english) return null;

  const fromBrief = semanticTitle(scene.visualBrief ?? '', 8);
  if (fromBrief) return titleCase(fromBrief);

  const fromModel = existingTitle ? semanticTitle(existingTitle, 8) : '';
  if (fromModel) return titleCase(fromModel);

  const purpose = (scene.purpose ?? '').trim();
  const terms = (scene.keyTerms ?? [])
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 2);
  const lower = purpose.toLowerCase();

  if ((lower === 'compare' || lower === 'comparison') && terms.length >= 2) {
    const phrase = `${titleCase(terms[0] ?? '')} vs ${titleCase(terms[1] ?? '')}`;
    if (isGoodTitle(phrase)) return phrase;
  }
  if ((lower === 'define' || lower === 'definition') && terms.length >= 1) {
    const phrase = `${titleCase(terms[0] ?? '')} Explained`;
    if (isGoodTitle(phrase)) return phrase;
  }
  if (purpose && !GENERIC_PURPOSES.has(lower)) {
    const phrase = terms.length > 0
      ? `${titleCase(purpose)}: ${terms.map((term) => titleCase(term)).join(', ')}`
      : titleCase(purpose);
    if (isGoodTitle(phrase)) return phrase;
  }

  return null;
}

/**
 * Remove text that says the same thing twice. A hook question keeps a single
 * bubble only when it is not already the caption; a title that the model cut
 * off is dropped rather than shown with an ellipsis.
 */
function dedupeNarration(
  children: SceneChild[],
  changes: string[],
  sceneIndex: number,
): SceneChild[] {
  const cues = subtitleCueTexts(children);
  const titleIndex = children.findIndex((child) => child.component === 'AnimatedText');
  const titleText = titleIndex >= 0 && typeof children[titleIndex]?.props['text'] === 'string'
    ? (children[titleIndex]!.props['text'] as string)
    : '';

  let removeTitle = false;
  const remove = new Set<number>();

  children.forEach((child, index) => {
    if (child.component !== 'SpeechBubble') return;
    const text = typeof child.props['text'] === 'string' ? child.props['text'] : '';
    if (!text.trim()) return;

    const duplicatesCue = cues.some((cue) => isDuplicateText(text, cue));
    const duplicatesTitle = titleText ? isDuplicateText(text, titleText) : false;
    const isQuestion = text.trim().endsWith('?');

    if (duplicatesTitle && isQuestion && !titleText.trim().endsWith('?')) {
      removeTitle = true;
      return;
    }
    if (duplicatesCue || duplicatesTitle) remove.add(index);
  });

  // Compare with every cue, not only the first: a split scene's title can
  // repeat the second or third caption just as easily as the opening one.
  if (titleText && cues.some((cue) => isDuplicateText(titleText, cue))) removeTitle = true;

  remove.forEach((index) => {
    const child = children[index];
    if (child) changes.push(`scene ${sceneIndex + 1}: removed duplicate ${child.component} text`);
  });
  if (removeTitle && titleIndex >= 0) {
    changes.push(`scene ${sceneIndex + 1}: removed a title that repeated the caption`);
  }

  return children.filter((_, index) => !remove.has(index) && !(removeTitle && index === titleIndex));
}

/** Narration the scene is actually speaking, read from its own caption cue. */
function sceneNarration(scene: SceneInstruction): string {
  const subtitle = scene.children?.find((child) => child.component === 'Subtitle');
  const entries = subtitle?.props['entries'];
  if (Array.isArray(entries)) {
    const text = entries
      .map((entry) =>
        typeof entry === 'object' && entry !== null
          ? (entry as { text?: unknown }).text
          : undefined,
      )
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
      .trim();
    if (text) return text;
  }

  const textChild = scene.children?.find((child) => child.component === 'AnimatedText');
  const text = textChild?.props['text'];
  return typeof text === 'string' ? text : '';
}

type InstructorState = 'idle' | 'wave' | 'point' | 'thinking';

/**
 * Which teaching scenes earn a presenter, and what gesture fits the beat.
 * Presenters support the lesson; they never replace the topic visual.
 */
function instructorStateFor(
  scene: SceneInstruction,
  index: number,
  totalScenes: number,
): InstructorState | null {
  if (totalScenes < 2 || index >= totalScenes - 1) return null;
  if (index === 0) return 'wave';

  const purpose = (scene.purpose ?? '').toLowerCase();
  if (purpose === 'hook' || purpose === 'recap' || purpose === 'summary') return 'wave';
  if (purpose === 'define' || purpose === 'definition' || purpose === 'example' || purpose === 'process') {
    return 'point';
  }
  if (purpose === 'compare' || purpose === 'data') return 'thinking';

  const narration = sceneNarration(scene);
  if (/\b(is called|are called|known as|means|refers to|for example|imagine|think of)\b/i.test(narration)) {
    return 'point';
  }
  if (/\b(compared|versus|unlike|percent|million|billion|thousand)\b/i.test(narration)) {
    return 'thinking';
  }
  return null;
}

function topicTitle(script: string): string {
  const match = TOPIC_TITLES.find(([pattern]) => pattern.test(script));
  if (match) return match[1];

  const firstSentence = script
    .split(/[.!?\n]/)
    .map((part) => part.trim())
    .find((part) => part.length > 0);

  const semantic = semanticTitle(firstSentence ?? '', 8);
  return semantic ? titleCase(semantic) : 'Thanks for watching!';
}

export function directStoryboard(
  plan: StoryboardPlan,
  script: string,
  voice?: string,
  language?: string,
): DirectedStoryboard {
  const changes: string[] = [];
  const totalScenes = plan.scenes.length;
  const instructor = resolveInstructor(voice);
  const english = isEnglish(language);
  const endCopy = END_SCREEN_COPY[english ? 'en' : 'mr'];
  let instructorScenes = 0;
  let previousPalette: PaletteId | undefined;

  const scenes: SceneInstruction[] = plan.scenes.map((scene, index) => {
    const children: SceneChild[] = [...(scene.children ?? [])];
    const narration = sceneNarration(scene);
    const isLast = index === totalScenes - 1;

    let component: ComponentName = scene.component;
    let props: Record<string, unknown> = { ...scene.props };

    // 1. Environment: a different palette for every scene, cycling patterns and
    //    camera moves so consecutive scenes never look identical.
    const palette = pickScenePalette(script, index, previousPalette);
    previousPalette = palette;
    const pattern = PATTERN_CYCLE[index % PATTERN_CYCLE.length] ?? 'dots';
    const camera = CAMERA_CYCLE[index % CAMERA_CYCLE.length] ?? 'zoomIn';

    if (component !== 'BackgroundScene') {
      // EduVideo paints the root component behind everything else, so a visual
      // at the root would hide the environment. Keep it, one layer down.
      children.unshift({ component, props: { ...scene.props } });
      changes.push(`scene ${index + 1}: moved ${component} above the background`);
      component = 'BackgroundScene';
      props = {};
    }

    props = { ...props, palette, pattern, camera };

    // Colour is planned centrally now. A leftover gradient/color prop would win
    // over the palette inside BackgroundScene and bring the dark slide look back.
    delete props['color'];
    delete props['gradient'];

    // Any extra BackgroundScene the model nested would paint over the planned
    // environment, so it gets the same palette and loses its own colour props.
    const backgroundIndex = children.findIndex((child) => child.component === 'BackgroundScene');
    if (backgroundIndex >= 0) {
      const existing = children[backgroundIndex];
      if (existing) {
        const existingProps: Record<string, unknown> = { ...existing.props, palette, pattern };
        delete existingProps['color'];
        delete existingProps['gradient'];
        children[backgroundIndex] = { ...existing, props: existingProps };
      }
    }

    // 2. Typography: a heading names the idea. It is never narration truncated
    //    mid-sentence, and a cut-off fragment is removed rather than displayed.
    const titleIndex = children.findIndex((child) => child.component === 'AnimatedText');
    const modelTitle = titleIndex >= 0 ? children[titleIndex]?.props['text'] : undefined;
    const heading = isLast
      ? null
      : sceneHeading(scene, typeof modelTitle === 'string' ? modelTitle : undefined, english);

    if (!isLast) {
      if (titleIndex >= 0) {
        const title = children[titleIndex];
        if (!heading) {
          children.splice(titleIndex, 1);
          changes.push(`scene ${index + 1}: removed a heading that was a caption fragment`);
        } else if (title) {
          children[titleIndex] = {
            ...title,
            props: { ...title.props, text: heading, top: '10%' },
          };
          if (heading !== modelTitle) {
            changes.push(`scene ${index + 1}: replaced heading with a semantic title`);
          }
        }
      } else if (heading) {
        children.unshift({
          component: 'AnimatedText',
          props: {
            text: heading,
            animation: 'words',
            fontSize: 58,
            fontWeight: 800,
            top: '10%',
            startFrame: 6,
          },
        });
        changes.push(`scene ${index + 1}: added a semantic heading`);
      }
    }

    // 3. Visual relevance is planned by the storyboard from the narration and
    //    analysis. Do not rewrite an explicit object here with a keyword guess.
    let directedChildren = children;

    // 4. Composition: the narration's intent decides the shape of the visual, so
    //    a process does not get a comparison chart and a recap does not get an
    //    icon. The closing scene is left to the EndScreen.
    const intent = isLast ? null : detectIntent(narration);
    const composition = intent
      ? buildComposition(intent, narration, scene, directedChildren)
      : null;

    if (composition) {
      const alreadyPresent = directedChildren.some(
        (child) => child.component === composition.child.component,
      );
      const isBubble = composition.child.component === 'SpeechBubble';
      // A bubble is an annotation, so it cannot share the middle lane with a
      // full-width process, comparison or diagram.
      const hasFullWidthVisual = directedChildren.some((child) =>
        FULL_WIDTH_VISUALS.has(child.component),
      );
      // A measured value stays a counter; a second chart would replace the very
      // number the narration is about.
      const keepsCounter = composition.intent !== 'summary'
        && directedChildren.some((child) =>
          child.component === 'NumberCounter' || child.component === 'AnimatedNumber',
        );

      if (alreadyPresent) {
        changes.push(`scene ${index + 1}: kept the model's ${composition.child.component}`);
      } else if (isBubble && hasFullWidthVisual) {
        changes.push(
          `scene ${index + 1}: skipped the speech bubble so it cannot cover the primary visual`,
        );
      } else if (keepsCounter) {
        changes.push(`scene ${index + 1}: kept the measured-value counter`);
      } else {
        directedChildren = directedChildren.filter(
          (child) => !composition.replace.has(child.component),
        );

        // A hook bubble lives low in the frame; lift the object it talks about.
        if (isBubble) {
          directedChildren = directedChildren.map((child) =>
            child.component === 'EducationalObject'
              ? { ...child, props: { ...child.props, top: '44%' } }
              : child,
          );
        }

        const endIndex = directedChildren.findIndex(
          (child) => child.component === 'EndScreen',
        );
        directedChildren = endIndex >= 0
          ? [
              ...directedChildren.slice(0, endIndex),
              composition.child,
              ...directedChildren.slice(endIndex),
            ]
          : [...directedChildren, composition.child];

        changes.push(
          `scene ${index + 1}: ${composition.child.component} for ${composition.intent} narration`,
        );
      }
    }

    // 4b. One idea, one sentence. Remove any title, bubble or caption that
    //     repeats another layer word for word before the presenter is added.
    directedChildren = dedupeNarration(directedChildren, changes, index);

    // 5. Presenter: pick a stable instructor for the selected voice and add it
    //    to the teaching beats that benefit from a human guide. A maximum of
    //    three appearances keeps it from becoming a talking-head video.
    const teacherIndex = directedChildren.findIndex(
      (child) => child.component === 'Teacher',
    );
    if (teacherIndex >= 0) {
      const existing = directedChildren[teacherIndex];
      if (existing) {
        directedChildren[teacherIndex] = {
          ...existing,
          props: {
            ...existing.props,
            appearance: instructor.id,
            voice,
            startFrame: existing.props['startFrame'] ?? 12,
          },
        };
        instructorScenes++;
        changes.push(`scene ${index + 1}: kept ${instructor.name} as the instructor`);
      }
    } else {
      const state = instructorStateFor(scene, index, totalScenes);
      if (state && instructorScenes < 3) {
        directedChildren.push({
          component: 'Teacher',
          props: {
            appearance: instructor.id,
            voice,
            state,
            size: 105,
            top: '78%',
            left: index % 2 === 0 ? '8%' : '92%',
            flipX: index % 2 === 1,
            startFrame: 12,
          },
        });
        instructorScenes++;
        changes.push(
          `scene ${index + 1}: added ${instructor.name} presenting (${state})`,
        );
      }
    }

    // 6. Ending: every video closes on a designed end screen. The end card owns
    //    the frame; leaving a diagram or title underneath it made the closing
    //    scene look like two slides stacked on top of each other.
    if (isLast) {
      directedChildren = directedChildren.filter(
        (child) => child.component === 'Subtitle' || child.component === 'EndScreen',
      );

      const endIndex = directedChildren.findIndex((child) => child.component === 'EndScreen');
      const existing = endIndex >= 0 ? directedChildren[endIndex] : undefined;
      const existingTitle = typeof existing?.props['title'] === 'string'
        ? existing.props['title'].trim()
        : typeof existing?.props['text'] === 'string'
          ? existing.props['text'].trim()
          : '';
      const existingSubtitle = typeof existing?.props['subtitle'] === 'string'
        ? existing.props['subtitle'].trim()
        : '';
      const existingKicker = typeof existing?.props['kicker'] === 'string'
        ? existing.props['kicker'].trim()
        : '';
      const recap = narration.replace(/\s+/g, ' ').trim();
      const endProps = {
        ...(existing?.props ?? {}),
        // Keep a specific model title, but replace the component's generic
        // default (which appears when the model used an unsupported `text` key).
        title: existingTitle && existingTitle !== END_SCREEN_DEFAULTS.title
          ? existingTitle
          : english
            ? topicTitle(script)
            : endCopy.title,
        subtitle: existingSubtitle && existingSubtitle !== END_SCREEN_DEFAULTS.subtitle
          ? existingSubtitle
          : recap
            ? `${endCopy.recapPrefix}${
              (english ? semanticTitle(recap, 9) : '')
              || (recap.split(/[.;!?।॥]/)[0] ?? recap).trim()
            }`
            : endCopy.subtitle,
        kicker: existingKicker && existingKicker.toUpperCase() !== END_SCREEN_DEFAULTS.kicker
          ? existingKicker
          : endCopy.kicker,
        showConfetti: existing?.props['showConfetti'] ?? true,
        startFrame: existing?.props['startFrame'] ?? 10,
      };

      if (existing) {
        directedChildren[endIndex] = { ...existing, props: endProps };
        changes.push('set EndScreen title from the video topic');
      } else {
        directedChildren.push({ component: 'EndScreen', props: endProps });
        changes.push('added EndScreen to the final scene');
      }
    }

    return {
      ...scene,
      component,
      props,
      children: directedChildren,
    };
  });

  return {
    storyboard: { ...plan, scenes },
    changes,
  };
}
