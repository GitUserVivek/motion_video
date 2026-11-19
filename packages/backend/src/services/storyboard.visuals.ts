import type { SceneChild, SceneInstruction, StoryboardPlan } from '@edumotion/shared';

/**
 * Icon set rendered by packages/renderer/src/components/EducationalObject.tsx.
 * Keep the two lists in sync: an unknown type renders a generic book.
 */
type TopicObjectType =
  | 'book' | 'apple' | 'globe' | 'atom' | 'lightbulb' | 'calculator' | 'pencil' | 'star'
  | 'leaf' | 'plant' | 'sun' | 'water' | 'cloud' | 'rocket' | 'heart' | 'cell' | 'microscope';

/** Components that depict the topic itself (as opposed to people or text). */
const TOPIC_COMPONENTS = new Set<string>([
  'EducationalObject',
  'ObjectGroup',
  'MultiplicationTable',
  'ImageScene',
  'QuestionCard',
]);

const LAYOUTS = ['50%', '68%', '32%', '60%', '40%'];

// Ordered: the first match wins, so more specific topics are listed first.
const TOPIC_KEYWORDS: Array<[TopicObjectType, RegExp]> = [
  ['plant', /\b(photosynthes\w*|plants?|leaves?|leaf|chlorophyll|glucose|stomata|roots?|stem)\b/i],
  ['sun', /\b(sun|sunlight|solar|light energy|ultraviolet|rays?)\b/i],
  ['water', /\b(water|rain|ocean|river|lake|evaporat\w*|condensat\w*|liquid|droplets?|ice|steam)\b/i],
  ['cloud', /\b(clouds?|weather|atmosphere|wind|storms?|climate|humidity)\b/i],
  ['rocket', /\b(rockets?|space|planets?|orbit|mars|moon|gravity|launch|astronaut|satellite)\b/i],
  ['atom', /\b(atoms?|molecules?|electrons?|chemical|reactions?|bonds?|elements?|acids?|physics|force|motion|speed)\b/i],
  ['cell', /\b(cells?|dna|genes?|bacteria|virus|nucleus|organisms?|biology|evolution)\b/i],
  ['heart', /\b(hearts?|blood|circulat\w*|lungs?|breath\w*|muscles?|body|digest\w*)\b/i],
  ['microscope', /\b(microscope|laboratory|experiments?|specimens?|microbes?)\b/i],
  ['calculator', /\b(numbers?|maths?|equations?|calculat\w*|fractions?|multipl\w*|add|subtract|algebra|geometry|percent\w*)\b/i],
  ['globe', /\b(earth|globe|countries|country|continents?|maps?|geography|culture)\b/i],
  ['book', /\b(books?|read\w*|stor(y|ies)|words?|grammar|history|writ\w*|letters?|poems?)\b/i],
  ['lightbulb', /\b(ideas?|think\w*|brain|learn\w*|invent\w*|electric\w*|circuits?|energy)\b/i],
  ['apple', /\b(food|fruits?|nutrition|eat\w*|healthy|diet)\b/i],
  ['pencil', /\b(draw\w*|pencils?|art|sketch\w*|design)\b/i],
  ['star', /\b(stars?|constellations?|night sky|awards?)\b/i],
];

const NUMBER_PATTERN = /\b(\d[\d,]*(?:\.\d+)?)\s*(%|percent|billion|million|thousand)?/i;

export function pickTopicObject(text: string, fallback: TopicObjectType = 'book'): TopicObjectType {
  for (const [type, pattern] of TOPIC_KEYWORDS) {
    if (pattern.test(text)) return type;
  }
  return fallback;
}

function childText(children: SceneChild[]): string {
  return children
    .flatMap((child) => {
      const text = child.props['text'];
      if (typeof text === 'string') return [text];
      const entries = child.props['entries'];
      if (Array.isArray(entries)) {
        return entries
          .map((entry) => (entry as { text?: unknown }).text)
          .filter((value): value is string => typeof value === 'string');
      }
      return [];
    })
    .join(' ');
}

function numberVisual(text: string, scene: SceneInstruction): SceneChild | null {
  const match = text.match(NUMBER_PATTERN);
  if (!match?.[1]) return null;
  const target = Number.parseFloat(match[1].replace(/,/g, ''));
  if (!Number.isFinite(target) || target <= 0) return null;
  const unit = match[2]?.toLowerCase();
  const suffix = unit === '%' || unit === 'percent'
    ? '%'
    : unit === 'billion'
    ? 'B'
    : unit === 'million'
    ? 'M'
    : unit === 'thousand'
    ? 'K'
    : '';

  return {
    component: 'AnimatedNumber',
    props: {
      target,
      suffix,
      startFrame: scene.startFrame + 18,
      duration: 45,
      fontSize: 96,
      color: '#FFD700',
      top: '33%',
      left: '50%',
    },
  };
}

/**
 * Make sure the scene shows the topic, not just words about it.
 *
 * A 7B model tends to plan `BackgroundScene + AnimatedText + Subtitle`, and even
 * when it adds a Teacher it rarely adds an object that depicts the subject. This
 * adds a topic illustration to every scene that lacks one, plus an animated
 * number when the narration contains one, and alternates placement so consecutive
 * scenes do not look like the same template.
 */
export function ensureSceneVisuals(
  storyboard: StoryboardPlan,
  script: string,
): { storyboard: StoryboardPlan; injected: number } {
  const fallback = pickTopicObject(script);
  let injected = 0;

  const scenes: SceneInstruction[] = storyboard.scenes.map((scene, index) => {
    const children = scene.children ?? [];

    const isClosing = scene.component === 'EndScreen'
      || children.some((child) => child.component === 'EndScreen');
    if (isClosing) return { ...scene, children };

    const narration = childText(children) || script;
    const extra: SceneChild[] = [];

    if (!children.some((child) => TOPIC_COMPONENTS.has(child.component))) {
      const type = pickTopicObject(narration, fallback);
      // Keep the graphic clear of the title (top ~15%) and captions (bottom 8%).
      extra.push({
        component: 'EducationalObject',
        props: {
          type,
          size: 250,
          top: index % 2 === 0 ? '56%' : '60%',
          left: LAYOUTS[index % LAYOUTS.length],
          startFrame: scene.startFrame + 8,
          animation: 'bounce',
        },
      });
    }

    if (!children.some((child) => child.component === 'AnimatedNumber')) {
      const number = numberVisual(narration, scene);
      if (number) extra.push(number);
    }

    if (extra.length === 0) return { ...scene, children };

    injected += extra.length;
    // Prepended so captions and titles painted afterwards stay on top.
    return { ...scene, children: [...extra, ...children] };
  });

  return { storyboard: { ...storyboard, scenes }, injected };
}
