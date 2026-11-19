import type { SceneChild, SceneInstruction, StoryboardPlan } from '@edumotion/shared';

/**
 * Icon set rendered by packages/renderer/src/components/EducationalObject.tsx.
 * Keep the two lists in sync: an unknown type renders nothing.
 */
type TopicObjectType =
  | 'book' | 'apple' | 'globe' | 'atom' | 'lightbulb' | 'calculator' | 'pencil' | 'star'
  | 'leaf' | 'plant' | 'sun' | 'water' | 'cloud' | 'rocket' | 'heart' | 'cell' | 'microscope';

/** Components that actually draw something, as opposed to text/captions. */
const VISUAL_COMPONENTS = new Set<string>([
  'Teacher',
  'Character',
  'EducationalObject',
  'ObjectGroup',
  'MultiplicationTable',
  'ImageScene',
  'QuestionCard',
  'Confetti',
]);

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

/**
 * Insert an EducationalObject into scenes that only contain text.
 *
 * A 7B model regularly plans `BackgroundScene + AnimatedText + Subtitle` and
 * ignores instructions to add visuals, which yields a video of talking text.
 * This guarantees at least one topical graphic per scene while leaving scenes
 * that already have a visual untouched.
 */
export function ensureSceneVisuals(
  storyboard: StoryboardPlan,
  script: string,
): { storyboard: StoryboardPlan; injected: number } {
  const fallback = pickTopicObject(script);
  let injected = 0;

  const scenes: SceneInstruction[] = storyboard.scenes.map((scene, index) => {
    const children = scene.children ?? [];

    const hasVisual = children.some((child) => VISUAL_COMPONENTS.has(child.component));
    const isClosing = scene.component === 'EndScreen'
      || children.some((child) => child.component === 'EndScreen');
    if (hasVisual || isClosing) return { ...scene, children };

    const type = pickTopicObject(childText(children) || script, fallback);

    // Keep the graphic clear of the title (top) and captions (bottom 8%), and
    // alternate sides so consecutive scenes do not look identical.
    const visual: SceneChild = {
      component: 'EducationalObject',
      props: {
        type,
        size: 260,
        top: index % 2 === 0 ? '54%' : '58%',
        left: index % 2 === 0 ? '50%' : '32%',
        startFrame: scene.startFrame + 8,
        animation: 'bounce',
      },
    };

    injected += 1;
    // Prepended so captions and text painted afterwards stay on top.
    return { ...scene, children: [visual, ...children] };
  });

  return { storyboard: { ...storyboard, scenes }, injected };
}
