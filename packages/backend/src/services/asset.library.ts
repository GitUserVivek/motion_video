import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

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
  return new Set(tokenize(text.replace(/[^A-Za-z0-9]+/g, ' ')));
}

/**
 * Find the artwork that best describes one diagram tile.
 *
 * Scoring is deliberately strict — a tile only takes an image when the file is
 * named after the icon it replaces (3 points) or after a word in the tile's own
 * label (2 points). A shared word with the narration alone is not enough: an
 * unrelated `rocket.png` must never land on a photosynthesis diagram.
 */
export function matchAssetImage(options: {
  icon: string;
  label: string;
  narration?: string;
  keyTerms?: string[];
  exclude?: Set<string>;
}): MatchedAsset | null {
  const pool = assets();
  if (pool.length === 0) return null;

  const iconTokens = new Set([options.icon, ...(ICON_TOKENS[options.icon] ?? [])]);
  const labelTokens = textTokens(options.label);
  const narrationTokens = options.narration ? textTokens(options.narration) : new Set<string>();
  const keyTokens = new Set(
    (options.keyTerms ?? []).flatMap((term) => [...textTokens(term)]),
  );
  const exclude = options.exclude ?? new Set<string>();

  let best: ImageAsset | null = null;
  let bestScore = 0;

  for (const asset of pool) {
    if (exclude.has(asset.id)) continue;

    // Downloaded artwork is only allowed when it represents one of the scene's
    // key terms. A narration-only coincidence is not enough for a downloaded
    // full-page or unrelated illustration.
    if (
      asset.id.startsWith('auto/') &&
      keyTokens.size > 0 &&
      !asset.tokens.some((token) => keyTokens.has(token))
    ) {
      continue;
    }

    let score = 0;
    for (const token of asset.tokens) {
      if (iconTokens.has(token)) score = Math.max(score, 3);
      else if (labelTokens.has(token)) score = Math.max(score, 2);
      else if (narrationTokens.has(token) && token.length >= 4) score = Math.max(score, 1);
    }
    // Allow a weak (narration-only) match as a fallback so a downloaded or
    // hand-placed file that is named after a word the scene actually says is
    // still used instead of the built-in glyph. A strong match (score >= 2)
    // always wins because it is preferred first by the score comparison below.
    if (score < 1) continue;

    const priority = EXT_PRIORITY[asset.ext] ?? 9;
    const bestPriority = best ? (EXT_PRIORITY[best.ext] ?? 9) : 9;
    if (score > bestScore || (score === bestScore && priority < bestPriority)) {
      best = asset;
      bestScore = score;
    }
  }

  if (!best) return null;
  const dataUrl = embed(best);
  return dataUrl ? { id: best.id, dataUrl, tokens: best.tokens } : null;
}
