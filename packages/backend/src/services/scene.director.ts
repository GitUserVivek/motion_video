import {
  pickScenePalette,
  type ComponentName,
  type PaletteId,
  type SceneChild,
  type SceneInstruction,
  type StoryboardPlan,
} from '@edumotion/shared';
import { alignObjectChild, pickTopicObject } from './storyboard.visuals.js';

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

/** Headings longer than this stop reading as titles. */
const MAX_HEADING_CHARS = 56;

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
    pattern: /\b(vs\.?|versus|compared (?:to|with)|unlike|whereas|instead of|rather than|more than|less than|better than|faster than|slower than)\b/i,
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
    pattern: /\b(at first|first|then|next|after that|finally|lastly|step \d|starts?|begins?|becomes|turns? into|produces?|releases?|absorbs?|converts?)\b/i,
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

/** Everything a summary card replaces; a recap should own the frame. */
const RECAP_REPLACE: ReadonlySet<ComponentName> = new Set<ComponentName>([
  'ConceptDiagram', 'ObjectGroup', 'EducationalObject', 'ImageScene',
  'SplitScreenComparison', 'ComparisonChart', 'SpeechBubble', 'AnnotatedCallout',
  'ProcessFlow', 'Timeline', 'SummaryScene',
]);

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

/** Narration cut into the clauses a process flow or recap can show. */
function clauses(text: string, maxChars: number): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?;:])\s+|\s+(?:then|next|after that|finally|lastly)\s+/i)
    .map((part) => tidyLabel(shorten(part, maxChars)))
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
    .split(/\b(?:vs\.?|versus|unlike|whereas|compared (?:to|with)|instead of|rather than)\b/i)
    .map((part) => part.trim())
    .filter((part) => contentWords(part).length > 0);
  if (parts.length < 2) return null;

  const left = shorten(tidyLabel(parts[0] ?? ''), 42);
  const right = shorten(tidyLabel(parts.slice(1).join(' ')), 42);
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
    const title = shorten(tidyLabel(piece.split(/[.;!?]/)[0] ?? ''), 44);
    if (!title) continue;
    events.push({
      date: shorten((match[0] ?? '').replace(/^the\s+/i, ''), 18),
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
  const startFrame = scene.startFrame + 10;

  switch (intent) {
    case 'summary': {
      const points = clauses(narration, 46).slice(0, 4);
      if (points.length < 2) return null;
      return {
        intent,
        replace: RECAP_REPLACE,
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
          replace: new Set<ComponentName>(['ConceptDiagram', 'SplitScreenComparison', 'ComparisonChart']),
          child: {
            component: 'ComparisonChart',
            props: {
              title: shorten(narration.split(/[.!?]/)[0] ?? '', 40),
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
          replace: new Set<ComponentName>(['ConceptDiagram', 'ComparisonChart']),
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
        replace: new Set<ComponentName>(['ConceptDiagram', 'Timeline']),
        child: {
          component: 'Timeline',
          props: { events, top: '58%', left: '50%', width: 880, startFrame },
        },
      };
    }

    case 'process': {
      const steps = clauses(narration, 30).slice(0, 4);
      if (steps.length < 2) return null;
      return {
        intent,
        replace: new Set<ComponentName>(['ConceptDiagram', 'ProcessFlow']),
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
        replace: new Set<ComponentName>([
          'ConceptDiagram', 'ObjectGroup', 'EducationalObject', 'ImageScene',
        ]),
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
      const question = narration
        .split(/(?<=[.!?])\s+/)
        .find((part) => part.includes('?'));
      const text = shorten(question ?? narration, 110);
      if (!text) return null;
      return {
        intent,
        replace: new Set<ComponentName>(['ConceptDiagram', 'ObjectGroup']),
        child: {
          component: 'SpeechBubble',
          props: {
            text,
            variant: question ? 'question' : 'statement',
            tail: 'left',
            top: '62%',
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

function shorten(text: string, maxChars: number): string {
  const clean = text.replace(/\s+/g, ' ').replace(/^[^A-Za-z0-9]+/, '').trim();
  if (clean.length <= maxChars) return clean;

  const cut = clean.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  const head = lastSpace > 12 ? cut.slice(0, lastSpace) : cut;
  return `${head.replace(/[,;:.\-–—]+$/, '').trim()}…`;
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

function topicTitle(script: string): string {
  const match = TOPIC_TITLES.find(([pattern]) => pattern.test(script));
  if (match) return match[1];

  const firstSentence = script
    .split(/[.!?\n]/)
    .map((part) => part.trim())
    .find((part) => part.length > 0);

  return shorten(firstSentence ?? '', MAX_HEADING_CHARS) || 'Thanks for watching!';
}

export function directStoryboard(plan: StoryboardPlan, script: string): DirectedStoryboard {
  const changes: string[] = [];
  const totalScenes = plan.scenes.length;
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

    // 2. Typography: a scene needs a short title, not the spoken paragraph.
    const titleIndex = children.findIndex((child) => child.component === 'AnimatedText');
    if (titleIndex >= 0) {
      const title = children[titleIndex];
      const text = title?.props['text'];
      if (title && typeof text === 'string' && text.trim().length > MAX_HEADING_CHARS) {
        children[titleIndex] = {
          ...title,
          props: { ...title.props, text: shorten(text, MAX_HEADING_CHARS) },
        };
        changes.push(`scene ${index + 1}: shortened heading`);
      }
    } else if (!isLast && narration) {
      children.unshift({
        component: 'AnimatedText',
        props: {
          text: shorten(narration, MAX_HEADING_CHARS),
          animation: 'words',
          fontSize: 62,
          fontWeight: 800,
          top: '12%',
          startFrame: scene.startFrame + 6,
        },
      });
      changes.push(`scene ${index + 1}: added heading`);
    }

    // 3. Visual relevance: the object on screen should be the thing being said.
    let directedChildren = children.map((child) => alignObjectChild(child, narration));

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

      if (alreadyPresent) {
        changes.push(`scene ${index + 1}: kept the model's ${composition.child.component}`);
      } else {
        directedChildren = directedChildren.filter(
          (child) => !composition.replace.has(child.component),
        );

        // A hook bubble lives low in the frame; lift the object it talks about.
        if (composition.child.component === 'SpeechBubble') {
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

    // 5. Ending: every video closes on a designed end screen.
    if (isLast) {
      // A root EndScreen was already moved into the children above, so this one
      // check covers both shapes.
      const hasEnd = directedChildren.some((child) => child.component === 'EndScreen');

      if (!hasEnd) {
        directedChildren.push({
          component: 'EndScreen',
          props: {
            title: topicTitle(script),
            subtitle: narration ? `In short: ${shorten(narration, 60)}` : 'Keep exploring with EduMotion',
            showConfetti: true,
            startFrame: scene.startFrame + 10,
          },
        });
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
