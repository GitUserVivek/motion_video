import type { MatchedAsset } from './asset.library.js';

/**
 * Deterministic verification that an attached file represents the concept it is
 * assigned to. Downloaded artwork must name at least one scene key term; local
 * library artwork may be accepted by its icon/label match, but a backdrop or a
 * generic downloaded icon is rejected.
 *
 * Sharing a word with the scene is not enough. A file called "Mars Cube One" is
 * a spacecraft, not a geometric cube, and "Hierarchy of Control Pyramid" is a
 * workplace-safety chart, not a geometric pyramid. Those candidates name a
 * different *semantic field* than the scene discusses, so the verifier rejects
 * any candidate whose identity carries a field marker the scene never uses.
 * The field list is generic subject vocabulary, not a list of target topics.
 */
export interface AssetVerdict {
  accepted: boolean;
  reason: string;
  matchedTerms: string[];
  /** Semantic fields the candidate belongs to that the scene does not discuss. */
  conflicts: string[];
}

const GENERIC_TOKENS = new Set([
  'icon', 'icons', 'image', 'images', 'img', 'picture', 'photo', 'clipart',
  'vector', 'flat', 'line', 'outline', 'color', 'colour', 'solid', 'filled',
  'asset', 'assets', 'resource', 'resources', 'download', 'downloaded', 'auto',
  'background', 'backgrounds', 'backdrop', 'backdrops',
  'diagram', 'diagrams', 'illustration', 'illustrations', 'drawing', 'drawings',
  'chart', 'charts', 'graphic', 'graphics', 'simple', 'basic', 'labeled',
  'labelled', 'white', 'black', 'svg', 'png', 'jpg', 'jpeg', 'webp', 'public',
  'domain', 'commons', 'wikimedia',
]);

/**
 * Markers for a subject area. A candidate that carries a marker from a field
 * the scene never mentions is about something else, even when one word happens
 * to be shared. Keep these grouped by *meaning*, not by any single video topic.
 */
const SEMANTIC_FIELDS: Record<string, readonly string[]> = {
  space: [
    'space', 'spacecraft', 'spaceship', 'satellite', 'mars', 'moon', 'planet',
    'orbit', 'rocket', 'astronaut', 'nasa', 'lunar', 'galaxy', 'cosmos',
    'telescope', 'comet', 'asteroid', 'mission', 'rover',
  ],
  safety: [
    'safety', 'hierarchy', 'workplace', 'osha', 'hazard', 'hazards', 'risk',
    'regulation', 'regulations', 'compliance', 'management', 'manager',
  ],
  finance: [
    'finance', 'financial', 'profit', 'loss', 'revenue', 'cost', 'costs',
    'tax', 'investment', 'investor', 'stock', 'market', 'business', 'economy',
    'accounting', 'invoice', 'budget',
  ],
  military: [
    'military', 'army', 'navy', 'weapon', 'weapons', 'soldier', 'combat',
    'war', 'battle', 'tank', 'missile',
  ],
  religion: [
    'religion', 'religious', 'church', 'temple', 'mosque', 'bible', 'quran',
    'god', 'prayer', 'worship',
  ],
  sports: [
    'sport', 'sports', 'football', 'soccer', 'basketball', 'tennis', 'athlete',
    'olympic', 'stadium', 'team',
  ],
  food: [
    'food', 'recipe', 'cooking', 'kitchen', 'meal', 'restaurant', 'dessert',
    'nutrition', 'diet', 'calorie', 'calories',
  ],
  transport: [
    'car', 'cars', 'truck', 'bus', 'train', 'aircraft', 'airplane', 'ship',
    'traffic', 'highway', 'engine',
  ],
  computing: [
    'computer', 'software', 'hardware', 'code', 'coding', 'programming',
    'server', 'database', 'internet', 'network', 'algorithm', 'chip',
  ],
  biology: [
    'biology', 'biological', 'cell', 'cells', 'dna', 'gene', 'genes', 'organ',
    'organs', 'species', 'organism', 'anatomy', 'medical', 'medicine', 'patient',
  ],
  chemistry: [
    'chemistry', 'chemical', 'molecule', 'molecules', 'atom', 'atoms', 'acid',
    'reaction', 'laboratory', 'beaker', 'compound',
  ],
  geography: [
    'map', 'maps', 'country', 'countries', 'continent', 'continents', 'ocean',
    'river', 'mountain', 'climate', 'geography', 'region',
  ],
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

function wordVariants(token: string): string[] {
  if (token.endsWith('ies') && token.length > 4) return [token, `${token.slice(0, -3)}y`];
  if (token.endsWith('ing') && token.length > 5) {
    const stem = token.slice(0, -3);
    return [token, stem, `${stem}e`];
  }
  if (token.endsWith('ed') && token.length > 5) {
    const stem = token.slice(0, -2);
    return [token, stem, `${stem}e`];
  }
  if (token.endsWith('s') && !token.endsWith('ss') && token.length > 3) {
    return [token, token.slice(0, -1)];
  }
  return [token, `${token}s`];
}

function hasToken(tokens: Set<string>, token: string): boolean {
  return wordVariants(token).some((variant) => tokens.has(variant));
}

/** Identity of a candidate: the words that say what the file is about. */
function candidateIdentity(match: MatchedAsset): Set<string> {
  return new Set([...match.tokens.flatMap(tokenize), ...tokenize(match.id)]);
}

/**
 * Fields the candidate names that the scene's own vocabulary never mentions.
 * A scene that talks about space keeps its satellite pictures; a geometry scene
 * does not inherit a spacecraft just because the file name contains "cube".
 */
function conflictingFields(
  identity: Set<string>,
  sceneTokens: Set<string>,
): string[] {
  const conflicts: string[] = [];
  for (const [field, markers] of Object.entries(SEMANTIC_FIELDS)) {
    const marker = markers.find((word) => hasToken(identity, word));
    if (!marker) continue;
    // The scene may mention the field itself ("safety", "space", "profit").
    if (markers.some((word) => hasToken(sceneTokens, word))) continue;
    conflicts.push(field);
  }
  return conflicts;
}

export function verifyAssetMatch(
  match: MatchedAsset,
  keyTerms: string[],
): AssetVerdict {
  const keyTokens = new Set(keyTerms.flatMap(tokenize));
  const assetTokens = candidateIdentity(match);

  const path = match.id.toLowerCase();
  if (path.includes('/background') || path.startsWith('background') || path.includes('backdrop')) {
    return {
      accepted: false,
      reason: 'Backdrop images cannot be used as scene artwork.',
      matchedTerms: [],
      conflicts: [],
    };
  }

  if (keyTokens.size === 0) {
    // Older storyboards may have no analysis key terms. A hand-placed library
    // asset that matched its icon/label can still be used; a downloaded file
    // cannot be justified without a concept to verify it against.
    if (match.id.startsWith('auto/')) {
      return {
        accepted: false,
        reason: 'Downloaded asset cannot be verified without scene key terms.',
        matchedTerms: [],
        conflicts: [],
      };
    }
    return {
      accepted: true,
      reason: 'No scene key terms; library asset accepted on icon/label match.',
      matchedTerms: [],
      conflicts: [],
    };
  }

  const matchedTerms = [...keyTokens].filter((token) => hasToken(assetTokens, token));
  if (matchedTerms.length === 0) {
    return {
      accepted: false,
      reason: `Asset tokens (${[...assetTokens].slice(0, 8).join(', ')}) do not name any key term (${[...keyTokens].join(', ')}).`,
      matchedTerms: [],
      conflicts: [],
    };
  }

  // A downloaded file that only carries generic pack words is not evidence that
  // it depicts the concept.
  const specific = [...assetTokens].filter((token) => !GENERIC_TOKENS.has(token));
  if (match.id.startsWith('auto/') && specific.length === 0) {
    return {
      accepted: false,
      reason: 'Downloaded file has no concept-specific tokens.',
      matchedTerms,
      conflicts: [],
    };
  }

  // A candidate from a different subject area is about a different thing. This
  // is what stops a mission/spacecraft photo from illustrating a shape, or a
  // workplace-safety chart from illustrating a geometric solid.
  const conflicts = conflictingFields(assetTokens, keyTokens);
  if (conflicts.length > 0) {
    const shared = matchedTerms.join(', ');
    return {
      accepted: false,
      reason:
        `Names the shared term(s) ${shared}, but its identity belongs to ` +
        `${conflicts.join(', ')} — a field this scene does not discuss.`,
      matchedTerms,
      conflicts,
    };
  }

  return {
    accepted: true,
    reason: `Matches scene term(s): ${matchedTerms.join(', ')}`,
    matchedTerms,
    conflicts: [],
  };
}

/**
 * Whether the deterministic verdict can stand without a semantic judge.
 *
 * A rejection is always confident: the rules only reject for a concrete reason
 * (backdrop, no scene term, generic-only file, or a conflicting subject field).
 * An acceptance is confident when it matches at least two scene terms, or when
 * the candidate names nothing except scene words. One shared word plus extra
 * unexplained nouns ("heart anatomy chart", "leaf collection photo") is the
 * ambiguous case worth asking the local model about.
 */
export function isConfidentVerdict(
  verdict: AssetVerdict,
  match: MatchedAsset,
  keyTerms: string[],
): boolean {
  if (!verdict.accepted) return true;
  if (verdict.matchedTerms.length >= 2) return true;

  const sceneTokens = new Set(keyTerms.flatMap(tokenize));
  const extras = match.tokens
    .flatMap(tokenize)
    .filter((token) => token.length > 2)
    .filter((token) => !GENERIC_TOKENS.has(token))
    .filter((token) => !hasToken(sceneTokens, token));

  return extras.length === 0;
}
