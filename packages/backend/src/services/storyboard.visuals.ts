import type { SceneChild, SceneInstruction, StoryboardPlan } from '@edumotion/shared';
import { matchAssetImage } from './asset.library.js';

/**
 * Icon set rendered by packages/renderer/src/utils/icons.tsx (and therefore by
 * EducationalObject and ConceptDiagram). Keep the two lists in sync: an unknown
 * type renders a generic book.
 */
type TopicObjectType =
  | 'book' | 'apple' | 'globe' | 'atom' | 'lightbulb' | 'calculator' | 'pencil' | 'star'
  | 'leaf' | 'plant' | 'sun' | 'water' | 'cloud' | 'rocket' | 'heart' | 'cell' | 'microscope';

/** Components that depict the topic itself (as opposed to people or text). */
const TOPIC_COMPONENTS = new Set<string>([
  'EducationalObject',
  'ObjectGroup',
  'ConceptDiagram',
  'MultiplicationTable',
  'ImageScene',
  'QuestionCard',
]);

// Ordered: the first match wins, so more specific topics are listed first.
const TOPIC_KEYWORDS: Array<[TopicObjectType, RegExp]> = [
  ['plant', /\b(photosynthes\w*|plants?|leaves?|leaf|chlorophyll|glucose|stomata|roots?|stem)\b/i],
  ['sun', /\b(sun|sunlight|solar|light energy|ultraviolet|rays?)\b/i],
  ['water', /\b(water|rain|ocean|river|lake|evaporat\w*|condensat\w*|liquid|droplets?|ice|steam)\b/i],
  ['cloud', /\b(clouds?|weather|atmosphere|wind|storms?|climate|humidity|condens\w*|precipitat\w*|vapou?r)\b/i],
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

/** One labelled illustration inside a ConceptDiagram. */
export interface ConceptItem {
  icon: TopicObjectType;
  label: string;
  /** Artwork from resources/ or assets/, inlined as a data URL when one matches. */
  image?: string;
}

const MAX_CONCEPT_ITEMS = 4;

/** Last-resort labels so a diagram never collapses to a single shape. */
const CONCEPT_FILLERS: Array<[TopicObjectType, string]> = [
  ['lightbulb', 'key idea'],
  ['star', 'takeaway'],
  ['book', 'lesson'],
];

export function pickTopicObject(text: string, fallback: TopicObjectType = 'book'): TopicObjectType {
  for (const [type, pattern] of TOPIC_KEYWORDS) {
    if (pattern.test(text)) return type;
  }
  return fallback;
}

/** Turn a matched phrase into a short, title-cased label that fits under an icon. */
function labelize(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';

  // Two words is about all that fits on one line under a 130px tile.
  const label = cleaned.split(' ').slice(0, 2).join(' ');
  const titled = label.charAt(0).toUpperCase() + label.slice(1);
  return titled.length > 20 ? `${titled.slice(0, 19).trimEnd()}…` : titled;
}

function scanConcepts(text: string): Array<[TopicObjectType, string]> {
  const found: Array<[TopicObjectType, string]> = [];
  const seen = new Set<TopicObjectType>();
  for (const [icon, pattern] of TOPIC_KEYWORDS) {
    const match = text.match(pattern);
    if (!match?.[0] || seen.has(icon)) continue;
    seen.add(icon);
    found.push([icon, match[0]]);
  }
  return found;
}

/**
 * Give every tile the artwork from resources/ or assets/ that matches its icon
 * or its label. A tile without a match keeps its built-in SVG glyph, and one
 * file is never placed on two tiles of the same diagram.
 */
function attachImages<T extends { icon: string; label: string; image?: string }>(
  tiles: T[],
  narration: string,
): T[] {
  const used = new Set<string>();
  for (const tile of tiles) {
    if (tile.image) continue;
    const match = matchAssetImage({ icon: tile.icon, label: tile.label, narration, exclude: used });
    if (!match) continue;
    tile.image = match.dataUrl;
    used.add(match.id);
  }
  return tiles;
}

/** Same artwork lookup for a ConceptDiagram the model planned itself. */
function attachDiagramImages(child: SceneChild, narration: string): SceneChild {
  const items = child.props['items'];
  if (!Array.isArray(items)) return child;

  const used = new Set<string>();
  let changed = false;

  const next = items.map((raw) => {
    if (!raw || typeof raw !== 'object') return raw;
    const item = raw as { icon?: unknown; label?: unknown; image?: unknown };
    if (typeof item.icon !== 'string') return raw;
    if (typeof item.image === 'string' && item.image.startsWith('data:image/')) return raw;

    const match = matchAssetImage({
      icon: item.icon,
      label: typeof item.label === 'string' ? item.label : '',
      narration,
      exclude: used,
    });
    if (!match) return raw;

    used.add(match.id);
    changed = true;
    return { ...item, image: match.dataUrl };
  });

  return changed ? { ...child, props: { ...child.props, items: next } } : child;
}

/**
 * Build the item list for a scene's ConceptDiagram, entirely locally: keywords
 * from the scene's own narration first (so labels repeat words the viewer is
 * hearing), then the rest of the script, then generic fillers. Always returns
 * 2-4 items so the scene gets multiple SVGs plus text, never a lone icon.
 */
export function buildConceptItems(
  narration: string,
  script: string,
  fallback: TopicObjectType,
): ConceptItem[] {
  const items: ConceptItem[] = [];
  const seen = new Set<TopicObjectType>();

  const add = (icon: TopicObjectType, rawLabel: string): void => {
    if (items.length >= MAX_CONCEPT_ITEMS || seen.has(icon)) return;
    const label = labelize(rawLabel);
    if (!label) return;
    seen.add(icon);
    items.push({ icon, label });
  };

  for (const [icon, label] of scanConcepts(narration)) add(icon, label);
  if (items.length < 2) {
    for (const [icon, label] of scanConcepts(script)) add(icon, label);
  }
  if (items.length < 2) add(fallback, fallback);
  if (items.length < 2) {
    for (const [icon, label] of CONCEPT_FILLERS) add(icon, label);
  }

  return items.length >= 2 ? attachImages(items, narration) : [];
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
 * when it adds a Teacher it rarely adds an object that depicts the subject. For
 * every content scene this builds a ConceptDiagram from the narration on the
 * spot — several labelled SVG illustrations joined by arrows — and adds an
 * animated number when the narration contains one. Placement alternates so
 * consecutive scenes do not look like the same template.
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
    const enriched = children.map((child) =>
      child.component === 'ConceptDiagram' ? attachDiagramImages(child, narration) : child,
    );
    const extra: SceneChild[] = [];

    if (!children.some((child) => TOPIC_COMPONENTS.has(child.component))) {
      const items = buildConceptItems(narration, script, fallback);
      if (items.length >= 2) {
        // Keep the graphic clear of the title (top ~15%) and captions (bottom 8%),
        // and shrink the tiles as the row grows so four still fit in 1080px.
        extra.push({
          component: 'ConceptDiagram',
          props: {
            items,
            accent: '#8f7be0',
            iconSize: items.length >= 4 ? 118 : items.length === 3 ? 132 : 150,
            top: index % 2 === 0 ? '57%' : '61%',
            left: '50%',
            startFrame: scene.startFrame + 8,
          },
        });
      }
    }

    if (!children.some((child) => child.component === 'AnimatedNumber')) {
      const number = numberVisual(narration, scene);
      if (number) extra.push(number);
    }

    if (extra.length === 0) return { ...scene, children: enriched };

    injected += extra.length;
    // Prepended so captions and titles painted afterwards stay on top.
    return { ...scene, children: [...extra, ...enriched] };
  });

  return { storyboard: { ...storyboard, scenes }, injected };
}
