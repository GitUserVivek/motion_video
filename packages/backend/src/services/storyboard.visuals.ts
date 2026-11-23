import type {
  ContentAnalysis,
  SceneChild,
  SceneInstruction,
  StoryboardPlan,
} from '@edumotion/shared';
import { assetSource, matchAssetImage } from './asset.library.js';
import { verifyAssetMatch } from './asset.verify.js';
import { pickUserAsset } from './user.asset.match.js';
import type { UserAsset } from './user.asset.service.js';

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
  // diagram next to them would stack two visuals of the same idea. Keep this in
  // sync with the visual components in storyboard.validation.ts.
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

// Ordered: the first match wins, so more specific topics are listed first.
const TOPIC_KEYWORDS: Array<[TopicObjectType, RegExp]> = [
  ['plant', /\b(photosynthes\w*|plants?|leaves?|leaf|chlorophyll|glucose|stomata|roots?|stem)\b/i],
  ['sun', /\b(sun|sunlight|solar|light energy|ultraviolet|rays?)\b/i],
  ['water', /\b(water|rain|ocean|river|lake|evaporat\w*|condensat\w*|liquid|droplets?|ice|steam)\b/i],
  ['cloud', /\b(clouds?|weather|atmosphere|wind|storms?|climate|humidity|condens\w*|precipitat\w*|vapou?r)\b/i],
  ['rocket', /\b(rockets?|space|planets?|orbit|mars|moon|gravity|launch|astronaut|satellite)\b/i],
  ['atom', /\b(atoms?|molecules?|electrons?|chemical|reactions?|bonds?|elements?|acids?|physics|force|motion|speed)\b/i],
  ['cell', /\b(cells?|dna|genes?|bacteria|virus|nucleus|organisms?|biology|evolution|liver|enzyme|intestin\w*|stomach|digest\w*|nutrient|protein|food)\b/i],
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
  source: 'downloaded' | 'library' | 'builtin' | 'user';
  /** Candidate that was considered, even when it was rejected. */
  candidate?: string;
  /** Why a candidate was rejected, written to assets.json for the audit. */
  reason?: string;
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

interface UserImageContext {
  assets: UserAsset[];
  used: Set<string>;
  record: AssetRecorder;
  narration: string;
  brief: string;
  keyTerms: string[];
}

/** Attach a user upload only when its caption/keywords explain this slot. */
function attachUserImage(
  child: SceneChild,
  context: UserImageContext,
  label: string,
  icon: string,
  text: string,
): { image: string; imageAlt: string; imageSource: 'user' } | null {
  const asset = pickUserAsset(
    context.assets,
    { text: `${text} ${context.narration}`, brief: context.brief, keyTerms: context.keyTerms, label },
    context.used,
  );
  if (!asset) return null;
  context.used.add(asset.id);
  context.record({
    label,
    icon,
    asset: asset.assetPath,
    source: 'user',
  });
  return { image: asset.dataUrl, imageAlt: asset.caption || asset.fileName, imageSource: 'user' };
}

function attachUserArtwork(child: SceneChild, context: UserImageContext): SceneChild {
  if (child.component === 'ImageScene') {
    if (hasEmbeddedImage(child.props['image'])) return child;
    const image = attachUserImage(
      child,
      context,
      context.brief || 'Scene image',
      'image',
      `${context.brief} ${context.narration}`,
    );
    return image ? { ...child, props: { ...child.props, ...image } } : child;
  }

  if (child.component === 'EducationalObject') {
    if (hasEmbeddedImage(child.props['image'])) return child;
    const label = typeof child.props['type'] === 'string' ? child.props['type'] : 'object';
    const image = attachUserImage(child, context, label, label, `${label} ${context.narration}`);
    return image ? { ...child, props: { ...child.props, ...image } } : child;
  }

  if (child.component === 'AnnotatedCallout') {
    if (hasEmbeddedImage(child.props['image'])) return child;
    const label = context.brief || 'Annotated subject';
    const image = attachUserImage(child, context, label, 'image', `${context.brief} ${context.narration}`);
    return image ? { ...child, props: { ...child.props, ...image } } : child;
  }

  if (child.component === 'SplitScreenComparison') {
    let changed = false;
    const props = { ...child.props } as Record<string, unknown>;
    for (const side of ['left', 'right'] as const) {
      const raw = props[side];
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const pane = raw as Record<string, unknown>;
      if (hasEmbeddedImage(pane['image'])) continue;
      const label = typeof pane['content'] === 'string' ? pane['content'] : side;
      const image = attachUserImage(
        child,
        context,
        label,
        'image',
        `${label} ${context.narration}`,
      );
      if (image) {
        props[side] = { ...pane, ...image };
        changed = true;
      }
    }
    return changed ? { ...child, props } : child;
  }

  if (child.component === 'ConceptDiagram' || child.component === 'AnimatedDiagram') {
    const items = child.props['items'];
    if (!Array.isArray(items)) return child;
    let changed = false;
    const next = items.map((raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
      const item = raw as Record<string, unknown>;
      if (hasEmbeddedImage(item['image'])) return raw;
      const label = typeof item['label'] === 'string' ? item['label'] : '';
      if (!label) return raw;
      const image = attachUserImage(
        child,
        context,
        label,
        typeof item['icon'] === 'string' ? item['icon'] : 'image',
        label,
      );
      if (!image) return raw;
      changed = true;
      return { ...item, ...image };
    });
    return changed ? { ...child, props: { ...child.props, items: next } } : child;
  }

  if (child.component === 'ProcessFlow') {
    const steps = child.props['steps'];
    if (!Array.isArray(steps)) return child;
    let changed = false;
    const next = steps.map((raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
      const step = raw as Record<string, unknown>;
      if (hasEmbeddedImage(step['image'])) return raw;
      const label = typeof step['label'] === 'string' ? step['label'] : '';
      if (!label) return raw;
      const image = attachUserImage(child, context, label, 'image', label);
      if (!image) return raw;
      changed = true;
      return { ...step, ...image };
    });
    return changed ? { ...child, props: { ...child.props, steps: next } } : child;
  }

  if (child.component === 'Timeline') {
    const events = child.props['events'];
    if (!Array.isArray(events)) return child;
    let changed = false;
    const next = events.map((raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
      const event = raw as Record<string, unknown>;
      if (hasEmbeddedImage(event['image'])) return raw;
      const label = typeof event['title'] === 'string' ? event['title'] : '';
      if (!label) return raw;
      const image = attachUserImage(child, context, label, 'image', label);
      if (!image) return raw;
      changed = true;
      return { ...event, ...image };
    });
    return changed ? { ...child, props: { ...child.props, events: next } } : child;
  }

  if (child.component === 'SummaryScene' || child.component === 'ComparisonChart') {
    if (hasEmbeddedImage(child.props['image'])) return child;
    const label = typeof child.props['title'] === 'string' ? child.props['title'] : context.brief;
    const image = attachUserImage(child, context, label, 'image', label);
    return image ? { ...child, props: { ...child.props, ...image } } : child;
  }

  return child;
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

const KNOWN_OBJECT_TYPES: TopicObjectType[] = [
  'book', 'apple', 'globe', 'atom', 'lightbulb', 'calculator', 'pencil', 'star',
  'leaf', 'plant', 'sun', 'water', 'cloud', 'rocket', 'heart', 'cell', 'microscope',
  'brain', 'bone', 'skeleton', 'dna', 'neuron', 'circuit', 'server', 'network',
  'equation', 'chart', 'timeline', 'beaker', 'molecule', 'femur', 'skull', 'ribcage',
];

/** Only return an object type when the text actually names that object. */
export function explicitObjectType(text: string): TopicObjectType | null {
  const tokens = new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  return KNOWN_OBJECT_TYPES.find((type) => tokens.has(type)) ?? null;
}

/** A neutral object used only when nothing specific was named. */
function analysisFallbackObject(analysis?: ContentAnalysis): TopicObjectType {
  if (!analysis) return 'book';
  for (const term of analysis.keyTerms) {
    for (const visual of term.visualCandidates) {
      const explicit = explicitObjectType(visual);
      if (explicit) return explicit;
    }
  }
  return 'book';
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

/** Slide heading: the first meaningful clause of the scene's narration. */
function headingFor(narration: string): string {
  const segments = splitSegments(narration);
  // A split can leave a pronoun-only opener such as "this process." heading the
  // scene; prefer the first segment that actually names something.
  const first = segments.find((segment) => contentWords(segment).length >= 2)
    ?? segments[0]
    ?? '';
  const clause = first.split(',')[0] ?? first;
  return shorten(clause, 46);
}

/** Prefer a glyph that matches this segment and is not already on the row. */
function pickDistinctIcon(
  segment: string,
  used: Set<TopicObjectType>,
  fallback: TopicObjectType,
): TopicObjectType {
  const explicit = explicitObjectType(segment);
  if (explicit && !used.has(explicit)) return explicit;
  if (!used.has(fallback)) return fallback;
  // Never invent a random glyph just to avoid a repeated icon. The label is the
  // meaningful part of a text-labelled diagram.
  return 'book';
}

/**
 * Give every tile the artwork from resources/ or assets/ that matches its icon
 * or its label. A tile without a match keeps its built-in SVG glyph, and one
 * file is never placed on two tiles of the same diagram.
 */
function attachImages<T extends { icon: string; label: string; image?: string }>(
  tiles: T[],
  narration: string,
  keyTerms: string[],
  record?: AssetRecorder,
): T[] {
  const used = new Set<string>();
  for (const tile of tiles) {
    if (tile.image) continue;
    const match = matchAssetImage({
      icon: tile.icon,
      label: tile.label,
      narration,
      keyTerms,
      exclude: used,
    });
    if (match) {
      const verdict = verifyAssetMatch(match, keyTerms);
      if (!verdict.accepted) {
        console.warn(`[Assets] Rejected ${match.id}: ${verdict.reason}`);
        record?.({
          ...describePick(tile, null),
          candidate: match.id,
          reason: verdict.reason,
        });
        continue;
      }
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
  keyTerms: string[],
  record?: AssetRecorder,
  overwrite = false,
  used: Set<string> = new Set(),
): SceneChild {
  const items = child.props['items'];
  if (!Array.isArray(items)) return child;

  let changed = false;

  const next = items.map((raw) => {
    if (!raw || typeof raw !== 'object') return raw;
    const item = raw as { icon?: unknown; label?: unknown; image?: unknown; imageSource?: unknown };
    if (typeof item.icon !== 'string') return raw;
    if (typeof item.image === 'string' && item.image.startsWith('data:image/')) {
      // Never replace a file the user explicitly uploaded. Ordinary downloaded
      // artwork may still be re-attached on a later pass.
      if (!overwrite || item.imageSource === 'user') return raw;
    }

    const match = matchAssetImage({
      icon: item.icon,
      label: typeof item.label === 'string' ? item.label : '',
      narration,
      keyTerms,
      exclude: used,
    });
    const verdict = match ? verifyAssetMatch(match, keyTerms) : null;
    const accepted = verdict?.accepted ?? false;
    if (match && verdict && !verdict.accepted) {
      console.warn(
        `[Assets] Rejected diagram image ${match.id} for "${String(item.label)}": ${verdict.reason}`,
      );
    }

    record?.({
      label: typeof item.label === 'string' && item.label ? item.label : item.icon,
      icon: item.icon,
      asset: accepted ? match?.id ?? null : null,
      source: accepted && match ? assetSource(match.id) : 'builtin',
      ...(match && verdict && !verdict.accepted
        ? { candidate: match.id, reason: verdict.reason }
        : {}),
    });

    if (!match || !accepted) return raw;

    used.add(match.id);
    changed = true;
    return {
      ...item,
      image: match.dataUrl,
      imageAlt: match.tokens.slice(0, 8).join(' '),
    };
  });

  return changed ? { ...child, props: { ...child.props, items: next } } : child;
}

function hasEmbeddedImage(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:image/');
}

interface VerifiedArtwork {
  dataUrl: string;
  alt: string;
}

/** One verified library image for a labelled scene element. */
function verifiedArtwork(options: {
  label: string;
  icon: string;
  narration: string;
  keyTerms: string[];
  used: Set<string>;
  record?: AssetRecorder;
  fallback?: TopicObjectType;
}): VerifiedArtwork | null {
  const { label, icon, narration, keyTerms, used, record, fallback = 'book' } = options;
  const match = matchAssetImage({
    icon,
    label,
    narration,
    keyTerms,
    exclude: used,
  });
  if (!match) {
    record?.({ label, icon, asset: null, source: 'builtin' });
    return null;
  }

  const verdict = verifyAssetMatch(match, keyTerms);
  record?.({
    label,
    icon,
    asset: verdict.accepted ? match.id : null,
    source: verdict.accepted ? assetSource(match.id) : 'builtin',
    ...(verdict.accepted ? {} : { candidate: match.id, reason: verdict.reason }),
  });
  if (!verdict.accepted) {
    console.warn(`[Assets] Rejected image ${match.id} for "${label}": ${verdict.reason}`);
    return null;
  }

  used.add(match.id);
  return {
    dataUrl: match.dataUrl,
    alt: match.tokens.slice(0, 8).join(' '),
  };
}

function attachAnimatedDiagramImages(
  child: SceneChild,
  narration: string,
  keyTerms: string[],
  used: Set<string>,
  record?: AssetRecorder,
  fallback: TopicObjectType = 'book',
): SceneChild {
  const items = child.props['items'];
  if (!Array.isArray(items)) return child;

  let changed = false;
  const next = items.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const item = raw as Record<string, unknown>;
    if (hasEmbeddedImage(item['image'])) return raw;

    const label = typeof item['label'] === 'string' ? item['label'] : '';
    const icon = typeof item['icon'] === 'string' ? item['icon'] : pickTopicObject(label, fallback);
    const image = verifiedArtwork({
      label: label || icon,
      icon,
      narration,
      keyTerms,
      used,
      record,
      fallback,
    });
    if (!image) return raw;
    changed = true;
    return { ...item, image: image.dataUrl, imageAlt: image.alt };
  });

  return changed ? { ...child, props: { ...child.props, items: next } } : child;
}

function attachProcessFlowImages(
  child: SceneChild,
  narration: string,
  keyTerms: string[],
  used: Set<string>,
  record?: AssetRecorder,
  fallback: TopicObjectType = 'book',
): SceneChild {
  const steps = child.props['steps'];
  if (!Array.isArray(steps)) return child;

  let changed = false;
  const next = steps.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const step = raw as Record<string, unknown>;
    if (hasEmbeddedImage(step['image'])) return raw;

    const label = typeof step['label'] === 'string'
      ? step['label']
      : typeof step['text'] === 'string'
        ? step['text']
        : '';
    if (!label) return raw;

    const icon = pickTopicObject(label, fallback);
    const image = verifiedArtwork({
      label,
      icon,
      narration,
      keyTerms,
      used,
      record,
      fallback,
    });
    if (image) {
      changed = true;
      return {
        ...step,
        iconName: icon,
        image: image.dataUrl,
        imageAlt: image.alt,
      };
    }
    if (typeof step['iconName'] === 'string') return raw;
    changed = true;
    return { ...step, iconName: icon };
  });

  return changed ? { ...child, props: { ...child.props, steps: next } } : child;
}

function attachSplitScreenImages(
  child: SceneChild,
  narration: string,
  keyTerms: string[],
  used: Set<string>,
  record?: AssetRecorder,
  fallback: TopicObjectType = 'book',
): SceneChild {
  let changed = false;
  const props = { ...child.props } as Record<string, unknown>;

  for (const side of ['left', 'right'] as const) {
    const raw = props[side];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const pane = raw as Record<string, unknown>;
    if (hasEmbeddedImage(pane['image'])) continue;

    const label = typeof pane['content'] === 'string'
      ? pane['content']
      : typeof pane['text'] === 'string'
        ? pane['text']
        : '';
    if (!label) continue;

    const icon = pickTopicObject(label, fallback);
    const image = verifiedArtwork({
      label,
      icon,
      narration,
      keyTerms,
      used,
      record,
      fallback,
    });
    if (!image) continue;
    props[side] = { ...pane, image: image.dataUrl, imageAlt: image.alt };
    changed = true;
  }

  return changed ? { ...child, props } : child;
}

function attachAnnotatedCalloutImage(
  child: SceneChild,
  brief: string,
  narration: string,
  keyTerms: string[],
  used: Set<string>,
  record?: AssetRecorder,
  fallback: TopicObjectType = 'book',
): SceneChild {
  if (hasEmbeddedImage(child.props['image'])) return child;

  const subject = typeof child.props['subject'] === 'string'
    ? child.props['subject']
    : fallback;
  const label = brief.trim() || subject;
  const image = verifiedArtwork({
    label,
    icon: subject,
    narration,
    keyTerms,
    used,
    record,
    fallback,
  });
  return image
    ? { ...child, props: { ...child.props, image: image.dataUrl, imageAlt: image.alt } }
    : child;
}

function attachSingleImage(
  child: SceneChild,
  label: string,
  narration: string,
  keyTerms: string[],
  used: Set<string>,
  record?: AssetRecorder,
  fallback: TopicObjectType = 'book',
): SceneChild {
  if (hasEmbeddedImage(child.props['image'])) return child;
  const text = label.trim();
  if (!text) return child;

  const image = verifiedArtwork({
    label: text,
    icon: pickTopicObject(text, fallback),
    narration,
    keyTerms,
    used,
    record,
    fallback,
  });
  return image
    ? { ...child, props: { ...child.props, image: image.dataUrl, imageAlt: image.alt } }
    : child;
}

function attachTimelineImages(
  child: SceneChild,
  narration: string,
  keyTerms: string[],
  used: Set<string>,
  record?: AssetRecorder,
  fallback: TopicObjectType = 'book',
): SceneChild {
  const events = child.props['events'];
  if (!Array.isArray(events)) return child;

  let changed = false;
  const next = events.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const event = raw as Record<string, unknown>;
    if (hasEmbeddedImage(event['image'])) return raw;

    const title = typeof event['title'] === 'string'
      ? event['title']
      : typeof event['label'] === 'string'
        ? event['label']
        : '';
    if (!title) return raw;

    const image = verifiedArtwork({
      label: title,
      icon: pickTopicObject(title, fallback),
      narration,
      keyTerms,
      used,
      record,
      fallback,
    });
    if (!image) return raw;
    changed = true;
    return { ...event, image: image.dataUrl, imageAlt: image.alt };
  });

  return changed ? { ...child, props: { ...child.props, events: next } } : child;
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
  analysis?: ContentAnalysis,
  keyTerms: string[] = [],
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

  // Pass 1: analysis key terms the scene actually says, then the scene's own
  // wording, avoiding labels an earlier scene used.
  if (analysis) {
    const lowerNarration = narration.toLowerCase();
    for (const term of analysis.keyTerms) {
      const named = [term.term, ...term.synonyms].some((word) =>
        lowerNarration.includes(word.toLowerCase()),
      );
      if (!named) continue;
      push(
        explicitObjectType(`${term.term} ${term.visualCandidates.join(' ')}`) ?? fallback,
        titleCase(term.term),
      );
      if (items.length >= MAX_CONCEPT_ITEMS) break;
    }
  }
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
    // A repeated neutral glyph is preferable to inventing an unrelated icon just
    // to make the row look varied; the labels carry the meaning.
    for (const item of items) reserved.add(item.label.toLowerCase());
    return attachImages(items, narration, keyTerms, record);
  }
  return [];
}

function sceneKeyTerms(scene: SceneInstruction, analysis?: ContentAnalysis): string[] {
  const terms = new Set<string>(scene.keyTerms ?? []);
  const caption = childText(scene.children ?? []);
  const text = `${scene.visualBrief ?? ''} ${caption}`.toLowerCase();

  // The scene's own searches and caption words are the vocabulary that the
  // downloaded files will carry in their names. Without them, a perfectly good
  // caption-specific download could be rejected as "unrelated".
  for (const query of scene.assetQueries ?? []) {
    for (const word of contentWords(query)) terms.add(word);
  }
  for (const word of contentWords(caption)) terms.add(word);

  for (const term of analysis?.keyTerms ?? []) {
    if ([term.term, ...term.synonyms].some((word) => text.includes(word.toLowerCase()))) {
      terms.add(term.term);
      for (const synonym of term.synonyms) terms.add(synonym);
    }
  }
  return [...terms].filter((term) => term.trim().length > 1);
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

function numberVisual(measurement: Measurement, _scene: SceneInstruction): SceneChild {
  return {
    component: 'AnimatedNumber',
    props: {
      target: measurement.target,
      suffix: measurement.suffix,
      startFrame: 18,
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
export function attachSceneArtwork(
  storyboard: StoryboardPlan,
  analysis?: ContentAnalysis,
  userAssets: UserAsset[] = [],
): { storyboard: StoryboardPlan; assetUses: SceneAssetUse[] } {
  const assetUses: SceneAssetUse[] = [];
  const fallback = analysisFallbackObject(analysis);
  const usedUserAssets = new Set<string>();

  const scenes = storyboard.scenes.map((scene, index) => {
    const children = scene.children ?? [];
    const picks: AssetPick[] = [];
    const record: AssetRecorder = (pick) => picks.push(pick);
    // One file may explain several labels in a scene, but the same asset should
    // not be repeated side by side. Keep this set scene-wide.
    const used = new Set<string>();
    const narration = childText(children);
    const brief = scene.visualBrief ?? scene.keyTerms?.join(', ') ?? '';
    const displayText = `${brief} ${narration}`;
    const keyTerms = sceneKeyTerms(scene, analysis);
    const userContext: UserImageContext = {
      assets: userAssets,
      used: usedUserAssets,
      record,
      narration,
      brief,
      keyTerms,
    };
    const userChildren = children.map((child) => attachUserArtwork(child, userContext));

    const nextChildren = userChildren.map((child) => {
      if (child.component === 'ConceptDiagram') {
        return attachDiagramImages(child, displayText, keyTerms, record, true, used);
      }

      if (child.component === 'EducationalObject') {
        if (hasEmbeddedImage(child.props['image'])) return child;
        const type = typeof child.props['type'] === 'string' ? child.props['type'] : fallback;
        const image = verifiedArtwork({
          label: type,
          icon: type,
          narration: displayText,
          keyTerms,
          used,
          record,
          fallback,
        });
        return image
          ? { ...child, props: { ...child.props, image: image.dataUrl, imageAlt: image.alt } }
          : child;
      }

      if (child.component === 'AnimatedDiagram') {
        return attachAnimatedDiagramImages(
          child,
          displayText,
          keyTerms,
          used,
          record,
          fallback,
        );
      }

      if (child.component === 'ProcessFlow') {
        return attachProcessFlowImages(
          child,
          displayText,
          keyTerms,
          used,
          record,
          fallback,
        );
      }

      if (child.component === 'SplitScreenComparison') {
        return attachSplitScreenImages(
          child,
          displayText,
          keyTerms,
          used,
          record,
          fallback,
        );
      }

      if (child.component === 'AnnotatedCallout') {
        return attachAnnotatedCalloutImage(
          child,
          brief,
          displayText,
          keyTerms,
          used,
          record,
          fallback,
        );
      }

      if (child.component === 'Timeline') {
        return attachTimelineImages(
          child,
          displayText,
          keyTerms,
          used,
          record,
          fallback,
        );
      }

      if (child.component === 'SummaryScene') {
        const title = typeof child.props['title'] === 'string' ? child.props['title'] : brief;
        return attachSingleImage(
          child,
          title,
          displayText,
          keyTerms,
          used,
          record,
          fallback,
        );
      }

      if (child.component === 'ComparisonChart') {
        const title = typeof child.props['title'] === 'string' ? child.props['title'] : brief;
        return attachSingleImage(
          child,
          title,
          displayText,
          keyTerms,
          used,
          record,
          fallback,
        );
      }

      if (child.component === 'SpeechBubble') {
        const text = typeof child.props['text'] === 'string' ? child.props['text'] : brief;
        return attachSingleImage(
          child,
          text,
          displayText,
          keyTerms,
          used,
          record,
          fallback,
        );
      }

      return child;
    });

    assetUses.push(...picks.map((pick) => ({ sceneIndex: index, ...pick })));
    return { ...scene, children: nextChildren };
  });

  return { storyboard: { ...storyboard, scenes }, assetUses };
}

export function ensureSceneVisuals(
  storyboard: StoryboardPlan,
  script: string,
  analysis?: ContentAnalysis,
  jobId?: string,
): { storyboard: StoryboardPlan; injected: number; assetUses: SceneAssetUse[] } {
  const fallback = analysisFallbackObject(analysis);
  const sceneBriefs = new Map<string, string>();
  for (const scene of storyboard.scenes) {
    sceneBriefs.set(scene.id, scene.visualBrief ?? scene.keyTerms?.join(', ') ?? '');
  }
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
    const brief = sceneBriefs.get(scene.id) ?? '';
    const keyTerms = sceneKeyTerms(scene, analysis);
    // Do not re-point an explicitly planned object. Only replace a generic
    // object when the narration or analysis names a concrete one.
    const aligned = children.map((child) => {
      if (child.component !== 'EducationalObject') return child;
      const explicit = explicitObjectType(`${brief} ${narration}`);
      return explicit ? { ...child, props: { ...child.props, type: explicit } } : child;
    });
    const alignedProps = scene.component === 'EducationalObject'
      ? aligned.find((child) => child.component === 'EducationalObject')?.props ?? scene.props
      : scene.props;
    const enriched = aligned.map((child) => {
      if (child.component === 'ConceptDiagram') {
        return attachDiagramImages(child, `${brief} ${narration}`, keyTerms, record);
      }
      if (child.component !== 'EducationalObject') return child;
      if (typeof child.props['image'] === 'string' && child.props['image'].startsWith('data:image/')) {
        return child;
      }
      const type = typeof child.props['type'] === 'string' ? child.props['type'] : fallback;
      const match = matchAssetImage({
        icon: type,
        label: type,
        narration: `${brief} ${narration}`,
        keyTerms,
      });
      if (!match) return child;
      const verdict = verifyAssetMatch(match, keyTerms);
      record?.({
        label: type,
        icon: type,
        asset: verdict.accepted ? match.id : null,
        source: verdict.accepted ? assetSource(match.id) : 'builtin',
        ...(verdict.accepted ? {} : { candidate: match.id, reason: verdict.reason }),
      });
      if (!verdict.accepted) {
        console.warn(`[Assets] Rejected object image ${match.id}: ${verdict.reason}`);
        return child;
      }
      return {
        ...child,
        props: {
          ...child.props,
          image: match.dataUrl,
          imageAlt: match.tokens.slice(0, 8).join(' '),
        },
      };
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
            startFrame: 4,
          },
        });
      }
    }

    if (!children.some((child) => TOPIC_COMPONENTS.has(child.component))) {
      const items = buildConceptItems(
        narration,
        script,
        fallback,
        reserved,
        record,
        analysis,
        keyTerms,
      );
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
            startFrame: 8,
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
