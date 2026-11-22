import type { SceneChild, SceneInstruction, StoryboardPlan } from '@edumotion/shared';
import { assetSource, matchAssetImage } from './asset.library.js';

/**
 * Icon set rendered by packages/renderer/src/utils/icons.tsx (and therefore by
 * EducationalObject and ConceptDiagram). Keep the two lists in sync: an unknown
 * type renders a generic book.
 */
export type TopicObjectType =
  | 'book' | 'apple' | 'globe' | 'atom' | 'lightbulb' | 'calculator' | 'pencil' | 'star'
  | 'leaf' | 'plant' | 'sun' | 'water' | 'cloud' | 'rocket' | 'heart' | 'cell' | 'microscope'
  | 'brain' | 'bone' | 'skeleton' | 'dna' | 'neuron' | 'circuit' | 'server' | 'network'
  | 'equation' | 'chart' | 'timeline' | 'beaker' | 'molecule' | 'femur' | 'skull' | 'ribcage';

/** Components that depict the topic itself (as opposed to people or text). */
const TOPIC_COMPONENTS = new Set<string>([
  'EducationalObject',
  'ObjectGroup',
  'ConceptDiagram',
  'MultiplicationTable',
  'ImageScene',
  'QuestionCard',
  // Composition components already illustrate the topic themselves, so adding a
  // diagram next to them would stack two visuals of the same idea.
  'SpeechBubble',
  'AnnotatedCallout',
  'ComparisonChart',
  'SummaryScene',
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

/**
 * Words that make a tile label unreadable when they land on it. Diagram labels
 * used to be a single keyword from TOPIC_KEYWORDS, so a scene about subtraction
 * showed "Add" or "Number" under a random glyph.
 */
const STOPWORDS = new Set<string>([
  'the', 'a', 'an', 'and', 'or', 'but', 'so', 'because', 'if', 'then', 'than', 'that', 'this',
  'these', 'those', 'there', 'here', 'when', 'what', 'which', 'who', 'how', 'why', 'where',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am', 'do', 'does', 'did', 'has', 'have',
  'had', 'it', 'its', 'they', 'them', 'their', 'you', 'your', 'yours', 'we', 'our', 'ours',
  'i', 'my', 'me', 'he', 'she', 'his', 'her', 'him', 'us', 'of', 'to', 'in', 'on', 'at', 'for',
  'from', 'with', 'by', 'as', 'about', 'into', 'over', 'under', 'up', 'down', 'out', 'off',
  'will', 'would', 'can', 'could', 'should', 'may', 'might', 'must', 'not', 'no', 'yes', 'just',
  'also', 'very', 'only', 'like', 'more', 'most', 'some', 'any', 'all', 'each', 'every', 'one',
  'ones', 'two', 'three', 'let', 'lets', 'get', 'gets', 'got', 'make', 'makes', 'made', 'see',
  'sees', 'seen', 'say', 'says', 'said', 'know', 'knows', 'think', 'thinks', 'mean', 'means',
  'called', 'known', 'become', 'becomes', 'happens', 'happen', 'works', 'work', 'turns', 'turn',
  'starts', 'start', 'stops', 'stop', 'uses', 'use', 'used', 'uses', 'take', 'takes', 'taking',
  'away', 'first', 'next', 'finally', 'example', 'imagine', 'suppose', 'now', 'still', 'even',
  'falls', 'fall', 'forms', 'form', 'rises', 'rise', 'moves', 'move', 'travels', 'travel',
  'causes', 'cause', 'allows', 'allow', 'helps', 'help', 'needs', 'need', 'requires', 'require',
  'contains', 'contain', 'includes', 'include', 'produces', 'produce', 'creates', 'create',
  'gives', 'give', 'goes', 'go', 'comes', 'come', 'keeps', 'keep', 'adds', 'add', 'subtracts',
  'subtract', 'evaporates', 'evaporate', 'condenses', 'condense', 'remains', 'remain',
  'another', 'nothing', 'something', 'anything', 'everything', 'thing', 'things',
  'matches', 'basket', 'leftover', 'leftovers',
  'eat', 'eats', 'ate', 'eating',
]);

/**
 * A number only earns a full-screen callout when it measures something. A bare
 * count ("3 apples") used to become a 96px "3" with no context.
 */
const MEASUREMENT_PATTERN = /\b(\d[\d,]*(?:\.\d+)?)\s*(%|percent\b|billion\b|million\b|thousand\b|km\b|kg\b|grams?\b|met(?:er|re)s?\b|seconds?\b|minutes?\b|hours?\b|days?\b|years?\b|degrees?\b|°)/i;

/** One labelled illustration inside a ConceptDiagram. */
export interface ConceptItem {
  icon: TopicObjectType;
  label: string;
  /** Artwork from resources/ or assets/, inlined as a data URL when one matches. */
  image?: string;
}

/** Where one tile's artwork came from, shown on the render page. */
export interface SceneAssetUse {
  sceneIndex: number;
  label: string;
  icon: string;
  /** Library-relative file, e.g. `auto/heart-1a2b3c4d.svg`; null = built-in glyph. */
  asset: string | null;
  source: 'downloaded' | 'library' | 'builtin';
}

export type AssetPick = Omit<SceneAssetUse, 'sceneIndex'>;
export type AssetRecorder = (pick: AssetPick) => void;

function describePick(tile: { icon: string; label: string }, asset: string | null): AssetPick {
  return {
    label: tile.label,
    icon: tile.icon,
    asset,
    source: asset ? assetSource(asset) : 'builtin',
  };
}

const MAX_CONCEPT_ITEMS = 5;

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

/**
 * Re-point an EducationalObject at the concept the narration names. The model
 * happily renders a book next to "the heart pumps blood"; this fixes that
 * without inventing props, and leaves the type alone when the narration gives no
 * better match. Shared with the scene director so validation and the final
 * direction agree on what the object represents.
 */
export function alignObjectChild(child: SceneChild, narration: string): SceneChild {
  if (child.component !== 'EducationalObject') return child;

  const current = child.props['type'];
  if (typeof current !== 'string') return child;

  const better = pickTopicObject(narration, current as TopicObjectType);
  return better === current ? child : { ...child, props: { ...child.props, type: better } };
}

/**
 * Split narration into the smallest pieces that still carry meaning. Labels are
 * built from these, so they describe what the scene is saying instead of what a
 * fixed keyword table happens to contain.
 */
function splitSegments(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?;:])\s+|\s+(?:and|but|so|because|then|which|while)\s+/i)
    .map((segment) => segment.replace(/^[\s,;:.]+|[\s,;:.]+$/g, '').trim())
    .filter((segment) => segment.length > 0);
}

/** Meaningful words of a segment, in reading order. */
function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9%\- ]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word) && !/^[\d%.,-]+$/.test(word));
}

function titleCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Cut at a word boundary so a heading never ends mid-word. */
function shorten(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const cut = trimmed.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * The most informative term in a segment: a genuine two-word term when the words
 * are adjacent ("carbon dioxide"), otherwise the longest content word. Terms an
 * earlier scene already used are skipped, so scenes get their own tiles.
 */
function bestTerms(segment: string, blocked: Set<string>, limit = 2): string[] {
  const lower = segment.toLowerCase();
  const words = contentWords(lower);
  if (words.length === 0) return [];

  const pairs: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const first = words[i];
    const second = words[i + 1];
    if (!first || !second) continue;
    if (new RegExp(`\\b${first}\\s+${second}\\b`).test(lower)) pairs.push(`${first} ${second}`);
  }

  const candidates = [...pairs, ...words]
    .filter((candidate, index, all) => all.indexOf(candidate) === index)
    .sort((a, b) => b.length - a.length);

  const usable = candidates.filter((candidate) => !blocked.has(candidate));
  const chosen = (usable.length > 0 ? usable : candidates).slice(0, limit);
  return chosen.map((term) => (term.length > 24 ? shorten(term, 24) : term));
}

/** Slide heading: the first clause of the scene's narration. */
function headingFor(narration: string): string {
  const first = splitSegments(narration)[0] ?? '';
  const clause = first.split(',')[0] ?? first;
  return shorten(clause, 46);
}

/** Prefer a glyph that matches this segment and is not already on the row. */
function pickDistinctIcon(
  segment: string,
  used: Set<TopicObjectType>,
  fallback: TopicObjectType,
): TopicObjectType {
  for (const [icon, pattern] of TOPIC_KEYWORDS) {
    if (!used.has(icon) && pattern.test(segment)) return icon;
  }
  const preferred = pickTopicObject(segment, fallback);
  if (!used.has(preferred)) return preferred;
  return TOPIC_KEYWORDS.find(([icon]) => !used.has(icon))?.[0] ?? preferred;
}

/**
 * Give every tile the artwork from resources/ or assets/ that matches its icon
 * or its label. A tile without a match keeps its built-in SVG glyph, and one
 * file is never placed on two tiles of the same diagram.
 */
function attachImages<T extends { icon: string; label: string; image?: string }>(
  tiles: T[],
  narration: string,
  record?: AssetRecorder,
): T[] {
  const used = new Set<string>();
  for (const tile of tiles) {
    if (tile.image) continue;
    const match = matchAssetImage({ icon: tile.icon, label: tile.label, narration, exclude: used });
    if (match) {
      tile.image = match.dataUrl;
      used.add(match.id);
    }
    record?.(describePick(tile, match?.id ?? null));
  }
  return tiles;
}

/** Same artwork lookup for a ConceptDiagram the model planned itself. */
function attachDiagramImages(
  child: SceneChild,
  narration: string,
  record?: AssetRecorder,
): SceneChild {
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

    record?.({
      label: typeof item.label === 'string' && item.label ? item.label : item.icon,
      icon: item.icon,
      asset: match?.id ?? null,
      source: match ? assetSource(match.id) : 'builtin',
    });

    if (!match) return raw;

    used.add(match.id);
    changed = true;
    return { ...item, image: match.dataUrl };
  });

  return changed ? { ...child, props: { ...child.props, items: next } } : child;
}

/**
 * Build the tiles for a scene's ConceptDiagram from the scene's own narration:
 * each tile is labelled with the phrase that sentence is about, so the row reads
 * as the steps of the explanation instead of a random icon strip.
 *
 * `reserved` holds labels already used earlier in the video; they are skipped so
 * consecutive scenes do not repeat the same diagram.
 */
export function buildConceptItems(
  narration: string,
  script: string,
  fallback: TopicObjectType,
  reserved: Set<string> = new Set(),
  record?: AssetRecorder,
): ConceptItem[] {
  const items: ConceptItem[] = [];
  const blocked = new Set(reserved);
  const usedIcons = new Set<TopicObjectType>();

  const push = (icon: TopicObjectType, label: string): void => {
    if (items.length >= MAX_CONCEPT_ITEMS) return;
    const key = label.toLowerCase().trim();
    if (!key || blocked.has(key)) return;
    if (items.some((item) => item.label.toLowerCase() === key)) return;
    blocked.add(key);
    usedIcons.add(icon);
    items.push({ icon, label });
  };

  const addSegment = (segment: string): void => {
    // Use up to two important terms per segment so the diagram covers more of
    // the words the script actually names, instead of one tile per sentence.
    const terms = bestTerms(segment, blocked, 2);
    for (const term of terms) {
      if (items.length >= MAX_CONCEPT_ITEMS) return;
      push(pickDistinctIcon(segment, usedIcons, fallback), titleCase(term));
    }
  };

  // Pass 1: this scene's own wording, avoiding labels an earlier scene used.
  const narrationSegments = splitSegments(narration);
  narrationSegments.forEach(addSegment);

  // A one-sentence scene still gets a second tile from its own sentence.
  if (items.length < 2) {
    const firstSegment = narrationSegments[0];
    const spare = firstSegment ? bestTerms(firstSegment, blocked)[0] : undefined;
    if (firstSegment && spare) {
      push(pickDistinctIcon(firstSegment, usedIcons, fallback), titleCase(spare));
    }
  }

  // Pass 2: the rest of the script, still avoiding earlier labels.
  if (items.length < 2) splitSegments(script).forEach(addSegment);

  // Pass 3/4: the script repeats itself, so reuse is better than generic tiles.
  if (items.length < 2) {
    blocked.clear();
    usedIcons.clear();
    splitSegments(narration).forEach(addSegment);
    splitSegments(script).forEach(addSegment);
  }
  if (items.length < 2) {
    for (const [icon, label] of CONCEPT_FILLERS) push(icon, label);
  }

  if (items.length >= 2) {
    // Two tiles with the same glyph read as a mistake; give the later one an
    // unused glyph.
    const seenIcons = new Set<TopicObjectType>();
    for (const item of items) {
      if (seenIcons.has(item.icon)) {
        const alternative = TOPIC_KEYWORDS.find(([icon]) => !seenIcons.has(icon))?.[0];
        if (alternative) item.icon = alternative;
      }
      seenIcons.add(item.icon);
    }
    for (const item of items) reserved.add(item.label.toLowerCase());
    return attachImages(items, narration, record);
  }
  return [];
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

interface Measurement {
  target: number;
  suffix: string;
}

function findMeasurement(text: string): Measurement | null {
  const match = text.match(MEASUREMENT_PATTERN);
  if (!match?.[1]) return null;
  const target = Number.parseFloat(match[1].replace(/,/g, ''));
  if (!Number.isFinite(target) || target <= 0) return null;

  const unit = (match[2] ?? '').toLowerCase();
  const suffix = unit === '%' || unit === 'percent'
    ? '%'
    : unit === 'billion'
    ? 'B'
    : unit === 'million'
    ? 'M'
    : unit === 'thousand'
    ? 'K'
    : '';
  return { target, suffix };
}

function numberVisual(measurement: Measurement, scene: SceneInstruction): SceneChild {
  return {
    component: 'AnimatedNumber',
    props: {
      target: measurement.target,
      suffix: measurement.suffix,
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
 * Make sure the scene *explains* its idea, not just decorates the caption.
 *
 * For every content scene this adds:
 *  - a heading naming the idea, when the model did not write one;
 *  - a ConceptDiagram whose tiles are labelled with the scene's own phrases, so
 *    the row reads as the steps of the explanation;
 *  - an animated number only for a real measurement (30%, 5 km, 2 million).
 *
 * Placement alternates so consecutive scenes do not look like one template, and
 * labels already used earlier in the video are skipped.
 */
export function ensureSceneVisuals(
  storyboard: StoryboardPlan,
  script: string,
): { storyboard: StoryboardPlan; injected: number; assetUses: SceneAssetUse[] } {
  const fallback = pickTopicObject(script);
  const reserved = new Set<string>();
  const assetUses: SceneAssetUse[] = [];
  let injected = 0;

  const scenes: SceneInstruction[] = storyboard.scenes.map((scene, index) => {
    const children = scene.children ?? [];
    const picks: AssetPick[] = [];
    const record: AssetRecorder = (pick) => picks.push(pick);

    const isClosing = scene.component === 'EndScreen'
      || children.some((child) => child.component === 'EndScreen');
    if (isClosing) return { ...scene, children };

    const narration = childText(children) || script;
    // The model often picks an object unrelated to what the scene says, which
    // used to fail validation deterministically (relevance 0.35) and discard the
    // whole storyboard. Align it before anything is measured.
    const aligned = children.map((child) => alignObjectChild(child, narration));
    const alignedProps = scene.component === 'EducationalObject'
      ? alignObjectChild({ component: scene.component, props: scene.props }, narration).props
      : scene.props;
    const enriched = aligned.map((child) => {
      if (child.component === 'ConceptDiagram') return attachDiagramImages(child, narration, record);
      if (child.component !== 'EducationalObject') return child;
      if (typeof child.props['image'] === 'string' && child.props['image'].startsWith('data:image/')) {
        return child;
      }
      const type = typeof child.props['type'] === 'string' ? child.props['type'] : fallback;
      const match = matchAssetImage({ icon: type, label: type, narration });
      if (!match) return child;
      record?.({
        label: type,
        icon: type,
        asset: match.id,
        source: assetSource(match.id),
      });
      return { ...child, props: { ...child.props, image: match.dataUrl } };
    });
    const extra: SceneChild[] = [];

    // Every scene names the idea it teaches.
    if (!children.some((child) => child.component === 'AnimatedText')) {
      const heading = headingFor(narration);
      if (heading) {
        extra.push({
          component: 'AnimatedText',
          props: {
            text: heading,
            animation: 'words',
            fontSize: 58,
            top: '12%',
            startFrame: scene.startFrame + 4,
          },
        });
      }
    }

    if (!children.some((child) => TOPIC_COMPONENTS.has(child.component))) {
      const items = buildConceptItems(narration, script, fallback, reserved, record);
      if (items.length >= 2) {
        // Keep the graphic clear of the heading (~12%) and captions (bottom 8%).
        extra.push({
          component: 'ConceptDiagram',
          props: {
            items,
            accent: '#8f7be0',
            iconSize: items.length >= 4 ? 118 : items.length === 3 ? 132 : 150,
            top: index % 2 === 0 ? '58%' : '62%',
            left: '50%',
            startFrame: scene.startFrame + 8,
          },
        });
      }
    }

    if (!children.some((child) => child.component === 'AnimatedNumber')) {
      const measurement = findMeasurement(narration);
      if (measurement) extra.push(numberVisual(measurement, scene));
    }

    // Record what this scene's tiles ended up with, downloaded or not.
    assetUses.push(...picks.map((pick) => ({ sceneIndex: index, ...pick })));

    if (extra.length === 0) return { ...scene, props: alignedProps, children: enriched };

    injected += extra.length;
    // Prepended so captions and titles painted afterwards stay on top.
    return { ...scene, props: alignedProps, children: [...extra, ...enriched] };
  });

  return { storyboard: { ...storyboard, scenes }, injected, assetUses };
}
