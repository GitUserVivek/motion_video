import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { mappedTokens } from './text.language.js';

/**
 * Artwork the local `resources/` (and `assets/`) folders ship with, indexed by
 * the words in each file name. The render box has no image service, so instead
 * of handing Remotion a URL we inline the matched file as a `data:` URL in the
 * storyboard props. That keeps the render deterministic (no downloads, no
 * missing files at render time) and needs no static-file server.
 */

const IMAGE_EXTS = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif']);

/**
 * Backdrops are not scene artwork. A file like `backgrounds/minimal_light.svg`
 * shares words such as "light" with ordinary narration ("a billion light-years"),
 * so indexing it as an image tile puts a full-page background on a diagram.
 */
const BACKGROUND_DIRS = new Set(['background', 'backgrounds', 'backdrop', 'backdrops', 'bg']);

const MIME_BY_EXT: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/** Preferred when several files score the same: vector first, then small rasters. */
const EXT_PRIORITY: Record<string, number> = {
  '.svg': 0,
  '.png': 1,
  '.webp': 2,
  '.jpg': 3,
  '.jpeg': 3,
  '.gif': 4,
};

/** A tile is 150px; anything past this only bloats the props JSON. */
const MAX_EMBED_BYTES = 400 * 1024;
const MAX_DEPTH = 3;
const CACHE_MS = 15_000;

/** Folder/qualifier words that describe the pack, not the picture. */
const STOP_TOKENS = new Set([
  'icon', 'icons', 'image', 'images', 'img', 'png', 'svg', 'jpg', 'jpeg', 'webp',
  'gif', 'resources', 'resource', 'assets', 'asset', 'characters', 'backgrounds',
  'animations', 'sounds', 'photo', 'photos', 'picture', 'clipart', 'vector',
  'flat', 'line', 'outline', 'color', 'colour', 'solid', 'filled', 'final',
  'new', 'copy', 'v1', 'v2', 'small', 'large', 'the', 'and', 'for', 'with',
  // Folder created by the automatic downloader: it describes the source, not
  // the picture, so it must not become a matching word on every asset.
  'auto', 'downloaded',
]);

/** Words a file named after an icon can carry, keyed by the renderer's icon id. */
const ICON_TOKENS: Record<string, string[]> = {
  book: ['book', 'read', 'reading', 'story', 'library', 'history', 'word', 'grammar'],
  apple: ['apple', 'fruit', 'food', 'nutrition', 'healthy', 'diet'],
  globe: ['globe', 'earth', 'map', 'world', 'country', 'continent', 'geography'],
  atom: ['atom', 'molecule', 'electron', 'science', 'physics', 'chemistry', 'force'],
  lightbulb: ['lightbulb', 'bulb', 'idea', 'brain', 'think', 'learn', 'invent', 'circuit', 'electric'],
  calculator: ['calculator', 'math', 'maths', 'number', 'equation', 'algebra', 'geometry', 'percent'],
  pencil: ['pencil', 'draw', 'drawing', 'art', 'sketch', 'design', 'write'],
  star: ['star', 'night', 'award', 'constellation', 'success', 'trophy'],
  leaf: ['leaf', 'leaves', 'green', 'nature'],
  plant: ['plant', 'tree', 'flower', 'photosynthesis', 'chlorophyll'],
  sun: ['sun', 'sunlight', 'solar', 'ray', 'light', 'energy'],
  water: ['water', 'rain', 'river', 'ocean', 'lake', 'drop', 'droplet', 'liquid', 'evaporation'],
  cloud: ['cloud', 'weather', 'sky', 'storm', 'wind', 'vapor', 'vapour', 'condensation', 'atmosphere'],
  rocket: ['rocket', 'space', 'planet', 'moon', 'mars', 'orbit', 'launch', 'astronaut', 'satellite'],
  heart: ['heart', 'blood', 'body', 'lung', 'muscle', 'health', 'circulation'],
  cell: ['cell', 'dna', 'gene', 'bacteria', 'virus', 'biology', 'microbe'],
  microscope: ['microscope', 'lab', 'laboratory', 'experiment', 'specimen'],
};

export interface ImageAsset {
  /** Root-relative path, e.g. `icons/water-cycle.svg`. */
  id: string;
  filePath: string;
  tokens: string[];
  ext: string;
}

export interface MatchedAsset {
  id: string;
  dataUrl: string;
  /** Meaningful filename/folder tokens, used to verify the match. */
  tokens: string[];
}

interface Cache {
  at: number;
  assets: ImageAsset[];
}

let cache: Cache | null = null;
const dataUrlCache = new Map<string, { mtimeMs: number; dataUrl: string | null }>();

/**
 * Downloaded artwork lives under `resources/auto/`, so the folder itself tells
 * the UI where a file came from.
 */
export function assetSource(id: string): 'downloaded' | 'library' {
  return id.startsWith('auto/') ? 'downloaded' : 'library';
}

/** Tests and long-running jobs can call this after dropping files in. */
export function resetAssetCache(): void {
  cache = null;
  dataUrlCache.clear();
}

function rootDirs(): string[] {
  return [config.storage.resourcesDir, config.storage.assetsDir];
}

/** `WaterCycle_v2.png` -> ['water', 'cycle', 'v2'] minus qualifier words. */
function tokenize(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOP_TOKENS.has(token))
    .map((token) => (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')
      ? token.slice(0, -1)
      : token));
}

function walk(dir: string, root: string, depth: number, out: ImageAsset[]): void {
  if (depth > MAX_DEPTH) return;
  // Never index backdrop folders: they are for the scene background only.
  const relativeDir = path.relative(root, dir);
  if (relativeDir.split(path.sep).some((segment) => BACKGROUND_DIRS.has(segment.toLowerCase()))) {
    return;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'sounds') continue;
      walk(full, root, depth + 1, out);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;

    const stem = path.basename(entry.name, path.extname(entry.name));
    // The folder name is part of the meaning: resources/weather/storm.png.
    const folder = path.basename(path.dirname(full));
    out.push({
      id: path.relative(root, full).split(path.sep).join('/'),
      filePath: full,
      ext,
      tokens: [...new Set([...tokenize(stem), ...tokenize(folder)])],
    });
  }
}

function assets(): ImageAsset[] {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.assets;

  const found: ImageAsset[] = [];
  for (const dir of rootDirs()) {
    if (!fs.existsSync(dir)) continue;
    walk(dir, dir, 0, found);
  }
  cache = { at: Date.now(), assets: found };
  return found;
}

function embed(asset: ImageAsset): string | null {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(asset.filePath);
  } catch {
    return null;
  }
  if (!stat.isFile() || stat.size === 0 || stat.size > MAX_EMBED_BYTES) return null;

  const cached = dataUrlCache.get(asset.filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.dataUrl;

  let dataUrl: string | null = null;
  try {
    const body = fs.readFileSync(asset.filePath).toString('base64');
    dataUrl = `data:${MIME_BY_EXT[asset.ext] ?? 'image/png'};base64,${body}`;
  } catch {
    dataUrl = null;
  }
  dataUrlCache.set(asset.filePath, { mtimeMs: stat.mtimeMs, dataUrl });
  return dataUrl;
}

/** Token set of a piece of narration/label, used for weaker matches. */
function textTokens(text: string): Set<string> {
  // Marathi labels are mapped to the English asset vocabulary in addition to
  // the literal tokens, so `पान` can match a leaf drawing instead of falling
  // through to an arbitrary download.
  const literal = tokenize(text.replace(/[^A-Za-z0-9]+/g, ' '));
  const mapped = mappedTokens(text).filter((token) => /^[a-z0-9]+$/.test(token));
  return new Set([...literal, ...mapped]);
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

/**
 * Ranked artwork for one diagram tile, best first.
 *
 * Scoring is deliberately strict — a tile only takes an image when the file is
 * named after the icon it replaces (3 points) or after a word in the tile's own
 * label (2 points). A shared word with the narration alone is not enough: an
 * unrelated `rocket.png` must never land on a photosynthesis diagram.
 *
 * The whole ranking is returned because a candidate can still be wrong for the
 * scene (a museum painting named after a word, a spacecraft called a cube). The
 * caller verifies each in order and keeps the first that passes, instead of
 * losing the tile when the top-scoring file is unusable.
 */
export function matchAssetImages(
  options: {
    icon: string;
    label: string;
    narration?: string;
    keyTerms?: string[];
    exclude?: Set<string>;
  },
  limit = 4,
): MatchedAsset[] {
  const pool = assets();
  if (pool.length === 0) return [];

  const iconTokens = new Set([options.icon, ...(ICON_TOKENS[options.icon] ?? [])]);
  const labelTokens = textTokens(options.label);
  const narrationTokens = options.narration ? textTokens(options.narration) : new Set<string>();
  const keyTokens = new Set(
    (options.keyTerms ?? []).flatMap((term) => [...textTokens(term)]),
  );
  const exclude = options.exclude ?? new Set<string>();

  const ranked: Array<{ asset: ImageAsset; score: number; priority: number }> = [];

  for (const asset of pool) {
    if (exclude.has(asset.id)) continue;

    // Downloaded artwork is only allowed when it represents one of the scene's
    // key terms. A narration-only coincidence is not enough for a downloaded
    // full-page or unrelated illustration.
    if (
      asset.id.startsWith('auto/') &&
      keyTokens.size > 0 &&
      !asset.tokens.some((token) =>
        wordVariants(token).some((variant) => keyTokens.has(variant)),
      )
    ) {
      continue;
    }

    let score = 0;
    for (const token of asset.tokens) {
      if (hasToken(iconTokens, token)) score = Math.max(score, 3);
      else if (hasToken(labelTokens, token)) score = Math.max(score, 2);
      else if (hasToken(narrationTokens, token) && token.length >= 4) score = Math.max(score, 1);
    }
    // A downloaded file must match the tile's icon or label (score 2), not just
    // share a word with the scene's English visual brief. Narration-only
    // matches are what put a CO₂ molecule on a leaf tile.
    const minScore = asset.id.startsWith('auto/') ? 2 : 1;
    if (score < minScore) continue;

    ranked.push({ asset, score, priority: EXT_PRIORITY[asset.ext] ?? 9 });
  }

  ranked.sort((a, b) => b.score - a.score || a.priority - b.priority || a.asset.id.localeCompare(b.asset.id));

  const matches: MatchedAsset[] = [];
  for (const { asset } of ranked) {
    if (matches.length >= Math.max(1, limit)) break;
    const dataUrl = embed(asset);
    if (!dataUrl) continue;
    matches.push({ id: asset.id, dataUrl, tokens: asset.tokens });
  }
  return matches;
}

/** The single best artwork for one tile; see `matchAssetImages` for the ranking. */
export function matchAssetImage(options: {
  icon: string;
  label: string;
  narration?: string;
  keyTerms?: string[];
  exclude?: Set<string>;
}): MatchedAsset | null {
  return matchAssetImages(options, 1)[0] ?? null;
}
