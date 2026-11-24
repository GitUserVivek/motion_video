import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { SceneInstruction } from '@edumotion/shared';
import { config } from '../config.js';

/**
 * Automatic artwork discovery.
 *
 * The renderer can only use images that are inlined as `data:` URLs (no network
 * at render time), so this service downloads a small number of topic-relevant
 * illustrations into `resources/auto/` before the storyboard is built. The
 * existing artwork matcher indexes that folder like any hand-placed file, which
 * means a downloaded file is reused for every future video without any extra
 * bookkeeping.
 *
 * Rules this module follows:
 *  - only public, keyless sources with an open licence (Iconify, OpenMoji,
 *    Wikimedia Commons); unDraw / LottieFiles have no public search API and are
 *    deliberately NOT scraped;
 *  - downloads are cached by content hash and search results are cached on disk
 *    for a week, so a repeated topic costs nothing;
 *  - SVGs are sanitised (no scripts, no event handlers, no external references)
 *    before they may reach the renderer;
 *  - every failure is contained: rendering continues with the built-in SVG
 *    glyphs instead of waiting on a provider.
 */

const USER_AGENT = 'EduMotion/1.0 (local educational video generator)';
const SEARCH_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COLLECTION_LICENSE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Bump when cached search results gain fields, so old entries are ignored. */
const SEARCH_CACHE_VERSION = 'v6';
const OPENMOJI_VERSION = '15.1.0';
const OPENMOJI_INDEX_URL =
  `https://cdn.jsdelivr.net/npm/openmoji@${OPENMOJI_VERSION}/data/openmoji.json`;
const OPENMOJI_SVG_BASE = `https://cdn.jsdelivr.net/npm/openmoji@${OPENMOJI_VERSION}/color/svg`;
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_FETCH_ATTEMPTS = 3;
/** Wikimedia blocks bursty clients; keep all its API and upload calls serial. */
const WIKIMEDIA_MIN_INTERVAL_MS = 1100;
/**
 * Wikimedia now throttles original-file URLs much more aggressively than real
 * thumbnails. Ask for a normal 640px render, and for files narrower than that
 * fall back to a 320px thumbnail instead of the original upload.
 */
const WIKIMEDIA_THUMBNAIL_WIDTH = 640;
const WIKIMEDIA_SMALL_THUMBNAIL_WIDTH = 320;
/** Stop hammering Wikimedia for two minutes after a 429. */
const WIKIMEDIA_COOLDOWN_MS = 2 * 60 * 1000;
/** Iconify and jsDelivr need a shorter pause after a 429. */
const PROVIDER_COOLDOWN_MS = 60 * 1000;
/** A Retry-After this short can be waited out inside the request. */
const MAX_INLINE_RETRY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 15_000;

/**
 * Retry-After is either delta-seconds (`120`) or an HTTP date. A missing or
 * malformed value is unknown, not zero: retrying immediately makes a 429 worse.
 */
export function parseRetryAfterMs(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - now);
}

/** Exponential backoff with jitter; an explicit Retry-After always wins. */
export function retryDelayMs(
  attempt: number,
  retryAfterMs: number | null,
  random = Math.random,
): number {
  if (retryAfterMs !== null) return Math.min(MAX_RETRY_DELAY_MS, Math.max(250, retryAfterMs));
  const ceiling = Math.min(MAX_RETRY_DELAY_MS, 800 * 2 ** Math.max(0, attempt - 1));
  const jitter = 0.5 + Math.min(1, Math.max(0, random())) * 0.5;
  return Math.max(250, Math.round(ceiling * jitter));
}

export type AssetFormat = 'svg' | 'png' | 'jpg' | 'webp';
export type AssetProviderId = 'iconify' | 'openmoji' | 'wikimedia';

export interface AssetLicense {
  name: string;
  url?: string;
  attribution?: string;
}

export interface AssetCandidate {
  provider: AssetProviderId;
  /** Provider-specific id, e.g. `mdi:leaf` or an OpenMoji hexcode. */
  id: string;
  name: string;
  tags: string[];
  format: AssetFormat;
  url: string;
  license: AssetLicense;
  /** True when the provider delivers inherently colourful artwork. */
  colorful?: boolean;
  score: number;
}

export interface AssetManifestEntry {
  query: string;
  provider: AssetProviderId;
  id: string;
  relativePath: string;
  format: AssetFormat;
  bytes: number;
  sha256: string;
  license: AssetLicense;
  downloadedAt: string;
}

export interface DiscoverySummary {
  enabled: boolean;
  queries: string[];
  downloaded: number;
  reused: number;
  skipped: number;
  errors: string[];
}

interface SearchCacheEntry {
  at: number;
  candidates: AssetCandidate[];
}

interface OpenMojiEntry {
  hexcode?: string;
  annotation?: string;
  tags?: string;
  openmoji_tags?: string;
}

interface WikimediaImageInfo {
  thumburl?: string;
  url?: string;
  mime?: string;
  width?: number;
  height?: number;
  extmetadata?: Record<string, { value?: string }>;
}

interface WikimediaResponse {
  query?: {
    pages?: Record<string, { title?: string; imageinfo?: WikimediaImageInfo[] }>;
  };
}

interface IconifyCollection {
  info?: {
    name?: string;
    author?: { name?: string; url?: string };
    license?: { title?: string; spdx?: string; url?: string };
  };
}

/** Per-icon-set licences. Unknown sets fall back to a link to the set page. */
const ICONIFY_LICENSES: Record<string, AssetLicense> = {
  mdi: { name: 'Apache-2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0', attribution: 'Material Design Icons' },
  tabler: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
  ph: { name: 'MIT', url: 'https://opensource.org/licenses/MIT', attribution: 'Phosphor Icons' },
  'simple-icons': { name: 'CC0-1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  logos: { name: 'CC0-1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  'fluent-emoji': { name: 'MIT', url: 'https://opensource.org/licenses/MIT', attribution: 'Microsoft Fluent Emoji' },
  'fluent-emoji-flat': { name: 'MIT', url: 'https://opensource.org/licenses/MIT', attribution: 'Microsoft Fluent Emoji' },
  'material-symbols': { name: 'Apache-2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0' },
  twemoji: { name: 'CC-BY-4.0', url: 'https://creativecommons.org/licenses/by/4.0/', attribution: 'Twitter Twemoji' },
  noto: { name: 'CC-BY-4.0', url: 'https://creativecommons.org/licenses/by/4.0/', attribution: 'Google Noto Emoji' },
};

const OPENMOJI_LICENSE: AssetLicense = {
  name: 'CC BY-SA 4.0',
  url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  attribution: 'OpenMoji (HfG Schwäbisch Gmünd)',
};

/** True only for a URL that points at a generated thumbnail, not an original. */
function isWikimediaThumbnailUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.startsWith('thumb.') || parsed.pathname.includes('/thumb/');
  } catch {
    return false;
  }
}

/**
 * Pick a URL that is guaranteed to be a thumbnail.
 *
 * The Commons API returns the original file as `thumburl` when the requested
 * width is at least the source width (marked `thumbnail_unscaled`). Those
 * original URLs are the ones that now return HTTP 429, while thumbnails from
 * thumb.wikimedia.org work. For smaller files, Special:FilePath generates a
 * 320px thumbnail instead of handing back the original.
 */
export function selectWikimediaThumbnailUrl(
  title: string,
  info: { thumburl?: string; url?: string; width?: number },
): string | null {
  const direct = info.thumburl ?? info.url;
  if (direct && isWikimediaThumbnailUrl(direct)) return direct;

  // A file this small has no smaller thumbnail; reject it instead of fetching
  // an original URL that Wikimedia may rate-limit. Without a known width we
  // cannot guarantee the fallback is scaled either, so skip it.
  if (info.width === undefined || info.width <= WIKIMEDIA_SMALL_THUMBNAIL_WIDTH) {
    return null;
  }
  if (!/^File:/i.test(title)) return null;

  const name = title.replace(/^File:/i, '').trim().replace(/ /g, '_');
  if (!name) return null;
  return (
    'https://commons.wikimedia.org/wiki/Special:FilePath/' +
    `${encodeURIComponent(name)}?width=${WIKIMEDIA_SMALL_THUMBNAIL_WIDTH}`
  );
}

/**
 * Iconify contains both monochrome outline sets and full-colour illustration
 * sets. Prefer the colourful ones whenever the search returns any; a white
 * outline on a dark card reads as a placeholder, not an illustration.
 */
const COLORFUL_ICONIFY_PREFIXES = new Set([
  'flat-color-icons',
  'fluent-emoji',
  'fluent-emoji-flat',
  'fluent-emoji-high-contrast',
  'twemoji',
  'noto',
  'noto-v1',
  'openmoji',
  'emojione',
  'fxemoji',
  'streamline-emojis',
  'skill-icons',
  'logos',
]);

/** Warm, readable fallback for a monochrome Iconify set. */
const FALLBACK_ICON_COLOR = '%23FFB703';

/** A provider that only matched part of a multi-word query is not conclusive. */
const CONFIDENT_ASSET_SCORE = 0.9;

/** Query words that describe grammar rather than a thing to draw. */
const GENERIC_QUERY_WORDS = new Set([
  'the', 'and', 'but', 'for', 'with', 'this', 'that', 'these', 'those', 'from',
  'have', 'has', 'had', 'been', 'being', 'were', 'was', 'are', 'will', 'would',
  'can', 'could', 'should', 'may', 'might', 'must', 'into', 'onto', 'over',
  'under', 'between', 'through', 'about', 'after', 'before', 'when', 'where',
  'which', 'while', 'what', 'how', 'why', 'who', 'your', 'their', 'them',
  'they', 'you', 'our', 'its', 'his', 'her', 'all', 'any', 'each', 'every',
  'some', 'such', 'very', 'more', 'most', 'much', 'many', 'also', 'just',
  'like', 'than', 'then', 'there', 'here', 'now', 'not', 'yes', 'lets', 'let',
  'turn', 'turns', 'turning', 'make', 'makes', 'making', 'made', 'use', 'uses',
  'used', 'using', 'get', 'gets', 'keep', 'keeps', 'need', 'needs', 'help',
  'helps', 'call', 'called', 'means', 'mean', 'work', 'works', 'working',
  'happen', 'happens', 'really', 'actually', 'simply', 'maybe', 'still',
  'every', 'because', 'so', 'if', 'or', 'as', 'at', 'by', 'in', 'of', 'on',
  'to', 'up', 'we', 'it', 'is', 'be', 'do', 'does', 'did', 'one', 'two',
]);

/**
 * Terms worth searching for even when they appear once, because they are the
 * nouns an educational video is about. Multi-word terms are matched as text.
 */
const CONCEPT_LEXICON: readonly string[] = [
  'photosynthesis', 'chlorophyll', 'glucose', 'oxygen', 'carbon dioxide',
  'stomata', 'mitochondria', 'cell membrane', 'nucleus', 'dna', 'gene', 'enzyme',
  'protein', 'neuron', 'synapse', 'hormone', 'vaccine', 'antibody', 'bacteria',
  'virus', 'immune system', 'heart', 'ventricle', 'artery', 'blood vessel',
  'lung', 'kidney', 'liver', 'skeleton', 'femur', 'rib cage', 'skull',
  'brain', 'cerebrum', 'spinal cord', 'digestive system', 'protein',
  'atom', 'molecule', 'electron', 'proton', 'neutron', 'ion', 'covalent bond',
  'periodic table', 'acid', 'base', 'ph scale', 'gravity', 'friction',
  'magnetism', 'electricity', 'circuit', 'voltage', 'current', 'transistor',
  'semiconductor', 'microchip', 'cpu', 'gpu', 'memory', 'ram', 'hard drive',
  'operating system', 'algorithm', 'data structure', 'database', 'server',
  'router', 'internet', 'protocol', 'encryption', 'machine learning',
  'neural network', 'training data', 'model', 'artificial intelligence',
  'robot', 'sensor', 'solar panel', 'turbine', 'battery', 'engine', 'telescope',
  'satellite', 'rocket', 'orbit', 'planet', 'solar system', 'galaxy', 'black hole',
  'fraction', 'decimal', 'percentage', 'equation', 'algebra', 'geometry',
  'triangle', 'circle', 'graph', 'statistics', 'probability', 'calculator',
  'map', 'compass', 'volcano', 'earthquake', 'ecosystem', 'food chain',
  'recycling', 'climate change', 'greenhouse gas', 'water cycle', 'erosion',
];

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !GENERIC_QUERY_WORDS.has(word));
}

/** Stable, filename-safe form of a query: `How does the heart work?` → `how-does-the-heart-work`. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Remove everything from an SVG that can execute, phone home, or reference an
 * external resource at render time. Returns null when the file is not an SVG or
 * still looks unsafe afterwards.
 */
export function sanitizeSvg(svg: string): string | null {
  if (!/<svg[\s>]/i.test(svg)) return null;

  const cleaned = svg
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    // Keep local references (`href="#grad"`, `data:` images), drop the rest.
    .replace(/(?:xlink:)?href\s*=\s*"(?!#|data:image\/)[^"]*"/gi, '')
    .replace(/(?:xlink:)?href\s*=\s*'(?!#|data:image\/)[^']*'/gi, '')
    .replace(/(?:xlink:)?href\s*=\s*(?!#|"|')[^\s>]+/gi, '');

  if (/<script|\son[a-z]+\s*=|javascript:/i.test(cleaned)) return null;
  return cleaned;
}

/**
 * Turn the script into a handful of artwork searches. Concepts from the lexicon
 * win; otherwise the most repeated meaningful words and two-word phrases are
 * used, so an arbitrary topic still produces sensible queries.
 */
export function buildAssetQueries(script: string, max = 5): string[] {
  const scores = new Map<string, number>();

  const bump = (term: string, weight: number): void => {
    const key = term.toLowerCase().replace(/\s+/g, ' ').trim();
    if (key.length < 3 || /^\d+$/.test(key) || GENERIC_QUERY_WORDS.has(key)) return;
    scores.set(key, (scores.get(key) ?? 0) + weight);
  };

  const lowerScript = script.toLowerCase();

  for (const rawSentence of script.split(/[.!?;\n]+/)) {
    const words = tokenizeText(rawSentence);
    for (const word of words) bump(word, 1);

    for (let i = 0; i < words.length - 1; i++) {
      const first = words[i];
      const second = words[i + 1];
      if (first && second) bump(`${first} ${second}`, 1.4);
    }
  }

  for (const term of CONCEPT_LEXICON) {
    if (lowerScript.includes(term)) bump(term, 3);
  }

  const ranked = [...scores.entries()]
    .map(([term, score]) => ({
      term,
      // Prefer phrases and specific (longer) words over short generic ones.
      score: score + (term.includes(' ') ? 0.6 : 0) + Math.min(term.length, 18) * 0.03,
    }))
    .sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const queries: string[] = [];

  for (const { term } of ranked) {
    const slug = slugify(term);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    queries.push(term);
    if (queries.length >= Math.max(1, max)) break;
  }

  return queries;
}

/**
 * Build searches for one scene from its own words.
 *
 * The model's `assetQueries` are best, but split scenes (and repairs) often have
 * only a caption. In that case derive searches from the visible caption/bubble
 * and visual brief so the scene still gets artwork about what it is saying,
 * rather than a generic topic icon.
 */
export function buildSceneAssetQueries(scene: SceneInstruction, max = 3): string[] {
  const caption = (scene.children ?? [])
    .flatMap((child) => {
      const entries = child.props['entries'];
      if (Array.isArray(entries)) {
        return entries
          .map((entry) => (entry as { text?: unknown }).text)
          .filter((value): value is string => typeof value === 'string');
      }
      const text = child.props['text'];
      return typeof text === 'string' ? [text] : [];
    })
    .join(' ')
    .trim();

  const explicit = (scene.assetQueries ?? [])
    .map((query) => query.trim())
    .filter(Boolean);
  const keyTerms = (scene.keyTerms ?? [])
    .map((query) => query.trim())
    .filter(Boolean);
  const derived = buildAssetQueries(
    `${scene.visualBrief ?? ''} ${caption}`.trim(),
    Math.max(max, 4),
  );

  const queries: string[] = [];
  const seen = new Set<string>();
  for (const query of [...explicit, ...derived, ...keyTerms]) {
    const slug = slugify(query);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    queries.push(query);
    if (queries.length >= Math.max(1, max)) break;
  }
  return queries;
}

function tokenVariants(token: string): string[] {
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

function coversToken(candidateTokens: Set<string>, queryToken: string): boolean {
  return tokenVariants(queryToken).some((variant) => candidateTokens.has(variant));
}

function candidateTokens(candidate: Omit<AssetCandidate, 'score'>): Set<string> {
  return new Set([
    ...tokenizeText(candidate.name),
    ...candidate.tags.flatMap((tag) => tokenizeText(tag)),
  ]);
}

/**
 * A result is only usable when it actually names the query. Multi-word queries
 * need two real hits, not one generic word, so a random photo whose description
 * happens to contain "layered" cannot stand in for "layered processing".
 */
export function isConfidentCandidate(
  candidate: Omit<AssetCandidate, 'score'>,
  query: string,
): boolean {
  const queryTokens = new Set(tokenizeText(query));
  if (queryTokens.size === 0) return false;

  const tokens = candidateTokens(candidate);
  const matched = [...queryTokens].filter((token) => coversToken(tokens, token)).length;
  const required = queryTokens.size <= 2 ? queryTokens.size : 2;
  return matched >= required;
}

/** Higher is better: how much of the query the candidate actually covers. */
export function scoreAssetCandidate(
  candidate: Omit<AssetCandidate, 'score'>,
  query: string,
): number {
  const queryTokens = new Set(tokenizeText(query));
  if (queryTokens.size === 0) return 0;

  const tokens = candidateTokens(candidate);
  let matched = 0;
  for (const token of queryTokens) {
    if (coversToken(tokens, token)) matched++;
  }

  const providerWeight =
    candidate.provider === 'openmoji' ? 1.08 : candidate.provider === 'wikimedia' ? 1.02 : 0.95;
  const exact = candidate.name.toLowerCase().trim() === query.toLowerCase().trim() ? 0.2 : 0;
  const colorBonus = candidate.colorful ? 0.08 : 0;

  return Number(
    Math.min(1.2, (Math.min(1, matched / queryTokens.size) * providerWeight) + exact + colorBonus)
      .toFixed(3),
  );
}

class AssetDiscoveryService {
  private searchCache: Record<string, SearchCacheEntry> | null = null;
  private manifest: AssetManifestEntry[] | null = null;
  private openMojiIndex: OpenMojiEntry[] | null = null;
  private collectionLicenses: Record<string, AssetLicense> | null = null;
  private lastWikimediaRequestAt = 0;
  private hostBlockedUntil = new Map<string, number>();
  /** Hosts that failed during the current search, so an empty result is not cached. */
  private failedHosts = new Set<string>();

  isEnabled(): boolean {
    return config.assets.discoveryEnabled && typeof fetch === 'function';
  }

  /**
   * Download artwork for the concepts in `script`. Never throws: the caller
   * treats this as best-effort enrichment.
   */
  async ensureAssetsForScript(script: string): Promise<DiscoverySummary> {
    const summary: DiscoverySummary = {
      enabled: this.isEnabled(),
      queries: [],
      downloaded: 0,
      reused: 0,
      skipped: 0,
      errors: [],
    };

    if (!summary.enabled) {
      console.log('[Assets] Automatic discovery disabled — using built-in artwork');
      return summary;
    }

    summary.queries = buildAssetQueries(script, config.assets.maxQueriesPerJob);
    if (summary.queries.length === 0) {
      console.log('[Assets] No topic-specific search terms found in the script');
      return summary;
    }

    const startedAt = Date.now();

    for (const query of summary.queries) {
      try {
        const candidates = await this.discover(query);
        if (candidates.length === 0) {
          summary.skipped++;
          continue;
        }

        const status = await this.persistFirst(candidates, query);
        if (status === 'downloaded') summary.downloaded++;
        else if (status === 'reused') summary.reused++;
        else summary.skipped++;
      } catch (err) {
        summary.errors.push(`${query}: ${message(err)}`);
      }
    }

    this.writeCredits();

    console.log(
      `[Assets] ${summary.downloaded} downloaded, ${summary.reused} reused, ` +
        `${summary.skipped} skipped (${summary.queries.length} search term(s), ` +
        `${Date.now() - startedAt}ms)`,
    );
    for (const error of summary.errors) console.warn(`[Assets] ${error}`);

    return summary;
  }

  /**
   * Download artwork for a set of scene-level queries. The storyboard has
   * already named what each scene needs, so these queries are more specific than
   * the old whole-script keyword list.
   */
  async ensureAssetsForQueries(
    rawQueries: string[],
    max = config.assets.maxQueriesPerJob,
  ): Promise<DiscoverySummary> {
    const summary: DiscoverySummary = {
      enabled: this.isEnabled(),
      queries: [],
      downloaded: 0,
      reused: 0,
      skipped: 0,
      errors: [],
    };
    if (!summary.enabled) return summary;

    summary.queries = [...new Set(rawQueries.map((query) => query.trim()).filter(Boolean))]
      .slice(0, Math.max(1, max));
    if (summary.queries.length === 0) return summary;

    for (const query of summary.queries) {
      try {
        const candidates = await this.discover(query);
        if (candidates.length === 0) {
          summary.skipped++;
          continue;
        }
        const status = await this.persistFirst(candidates, query);
        if (status === 'downloaded') summary.downloaded++;
        else if (status === 'reused') summary.reused++;
        else summary.skipped++;
      } catch (err) {
        summary.errors.push(`${query}: ${message(err)}`);
      }
    }

    this.writeCredits();
    console.log(
      `[Assets] scene queries: ${summary.downloaded} downloaded, ${summary.reused} reused, ` +
        `${summary.skipped} skipped`,
    );
    for (const error of summary.errors) console.warn(`[Assets] ${error}`);
    return summary;
  }

  /** Downloaded files recorded so far, including licence and query. */
  getManifest(): AssetManifestEntry[] {
    return [...this.loadManifest()];
  }

  /**
   * Colour-first providers are tried in order. Stop as soon as one has a fully
   * covered query; otherwise keep the partial results and try the next provider
   * so a generic colour emoji cannot beat a precise illustration.
   */
  private async discover(query: string): Promise<AssetCandidate[]> {
    const cached = this.readSearchCache(query);
    if (cached) return cached;

    this.failedHosts.clear();
    const collected: AssetCandidate[] = [];

    for (const provider of config.assets.providers) {
      let candidates: AssetCandidate[] = [];

      if (provider === 'iconify') candidates = await this.searchIconify(query);
      else if (provider === 'openmoji') candidates = await this.searchOpenMoji(query);
      else if (provider === 'wikimedia') candidates = await this.searchWikimedia(query);

      const confident = candidates.filter((candidate) => isConfidentCandidate(candidate, query));
      if (confident.length === 0) continue;
      collected.push(...confident);

      const best = Math.max(...confident.map((candidate) => candidate.score));
      if (best >= CONFIDENT_ASSET_SCORE) break;
    }

    if (collected.length === 0) {
      // A provider outage or 429 is not "this topic has no artwork". Prefer an
      // expired search result over overwriting the cache with an empty list.
      const stale = this.readSearchCache(query, true);
      if (stale) {
        console.warn(`[Assets] Providers unavailable; using cached results for "${query}"`);
        return stale;
      }
      if (this.failedHosts.size === 0) this.writeSearchCache(query, []);
      return [];
    }

    const ranked = [...collected].sort((a, b) => b.score - a.score);
    this.writeSearchCache(query, ranked);
    return ranked;
  }

  // ---- providers -------------------------------------------------------

  private async searchIconify(query: string): Promise<AssetCandidate[]> {
    const data = await this.fetchJson<{ icons?: unknown }>(
      `https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=24`,
    );
    if (!data || !Array.isArray(data.icons)) return [];

    const parsedIcons: Array<{ prefix: string; name: string }> = [];

    for (const icon of data.icons.slice(0, 20)) {
      if (typeof icon !== 'string') continue;
      const [prefix, name] = icon.split(':');
      if (!prefix || !name) continue;
      parsedIcons.push({ prefix, name });
    }
    if (parsedIcons.length === 0) return [];

    // Keep emoji/flat-colour sets when any are available; only fall back to the
    // monochrome outline sets when the query has no colourful result at all.
    const colorfulIcons = parsedIcons.filter((icon) => COLORFUL_ICONIFY_PREFIXES.has(icon.prefix));
    const chosenIcons = (colorfulIcons.length > 0 ? colorfulIcons : parsedIcons).slice(0, 8);

    // Iconify publishes each set's real licence; resolve unknown prefixes once
    // instead of writing "See icon set" into the credits file.
    const licenses = await this.loadCollectionLicenses([
      ...new Set(chosenIcons.map((icon) => icon.prefix)),
    ]);

    return chosenIcons.map(({ prefix, name }) => {
      const colorful = COLORFUL_ICONIFY_PREFIXES.has(prefix);
      const base: Omit<AssetCandidate, 'score'> = {
        provider: 'iconify',
        id: `${prefix}:${name}`,
        name: name.replace(/-/g, ' '),
        tags: [prefix, name.replace(/-/g, ' ')],
        format: 'svg',
        colorful,
        // Colour sets carry their own palette; monochrome sets get a warm tint
        // instead of the old white tint, which disappeared into the cards.
        url: `https://api.iconify.design/${prefix}/${name}.svg?height=360${
          colorful ? '' : `&color=${FALLBACK_ICON_COLOR}`
        }`,
        license: licenses[prefix] ?? ICONIFY_LICENSES[prefix] ?? {
          name: 'See icon set',
          url: `https://icon-sets.iconify.design/${prefix}/`,
          attribution: prefix,
        },
      };

      return { ...base, score: scoreAssetCandidate(base, query) };
    });
  }

  /** Real licence titles from Iconify's collection metadata, cached for a month. */
  private async loadCollectionLicenses(prefixes: string[]): Promise<Record<string, AssetLicense>> {
    const cache = this.loadLicenseCache();
    const missing = prefixes.filter((prefix) => !cache[prefix]);
    if (missing.length === 0) return cache;

    const resolved = await Promise.all(
      missing.map(async (prefix) => {
        const data = await this.fetchJson<IconifyCollection>(
          `https://api.iconify.design/collection?prefix=${encodeURIComponent(prefix)}`,
        );
        const info = data?.info;
        const license = info?.license;
        if (!license) return null;

        return {
          prefix,
          license: {
            name: license.spdx ?? license.title ?? 'See icon set',
            ...(license.url ? { url: license.url } : {}),
            ...(info?.author?.name ? { attribution: info.author.name } : {}),
          },
        };
      }),
    );

    let changed = false;
    for (const entry of resolved) {
      if (!entry) continue;
      cache[entry.prefix] = entry.license;
      changed = true;
    }

    if (changed) this.saveLicenseCache(cache);
    return cache;
  }

  private loadLicenseCache(): Record<string, AssetLicense> {
    if (this.collectionLicenses) return this.collectionLicenses;

    const cachePath = path.join(config.assets.cacheDir, 'iconify-collections.json');

    try {
      const stat = fs.statSync(cachePath);
      if (Date.now() - stat.mtimeMs < COLLECTION_LICENSE_TTL_MS) {
        const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          this.collectionLicenses = parsed as Record<string, AssetLicense>;
          return this.collectionLicenses;
        }
      }
    } catch {
      // No usable cache yet.
    }

    this.collectionLicenses = {};
    return this.collectionLicenses;
  }

  private saveLicenseCache(cache: Record<string, AssetLicense>): void {
    try {
      fs.mkdirSync(config.assets.cacheDir, { recursive: true });
      fs.writeFileSync(
        path.join(config.assets.cacheDir, 'iconify-collections.json'),
        JSON.stringify(cache, null, 2),
        'utf-8',
      );
    } catch {
      // Caching licences is an optimisation only.
    }
  }

  private async searchOpenMoji(query: string): Promise<AssetCandidate[]> {
    const index = await this.loadOpenMojiIndex();
    if (!index) return [];

    const queryTokens = new Set(tokenizeText(query));
    if (queryTokens.size === 0) return [];

    const scored = index
      .map((entry) => {
        const tags = [
          ...new Set(
            tokenizeText(
              `${entry.annotation ?? ''} ${entry.tags ?? ''} ${entry.openmoji_tags ?? ''}`,
            ),
          ),
        ];
        const tagSet = new Set(tags);
        const hits = [...queryTokens].filter((token) => coversToken(tagSet, token)).length;
        return { entry, tags, hits };
      })
      .filter((item) => item.hits > 0 && typeof item.entry.hexcode === 'string')
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 3);

    return scored.map(({ entry, tags }) => {
      const base: Omit<AssetCandidate, 'score'> = {
        provider: 'openmoji' as const,
        id: entry.hexcode ?? '',
        name: entry.annotation ?? entry.hexcode ?? 'openmoji',
        tags,
        format: 'svg' as const,
        colorful: true,
        url: `${OPENMOJI_SVG_BASE}/${entry.hexcode ?? ''}.svg`,
        license: OPENMOJI_LICENSE,
      };
      return { ...base, score: scoreAssetCandidate(base, query) };
    });
  }

  private async searchWikimedia(query: string): Promise<AssetCandidate[]> {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      generator: 'search',
      gsrnamespace: '6',
      // Keep drawings/SVG diagrams as well as photos: a labelled diagram is
      // often the best match for an educational caption.
      gsrsearch: query,
      gsrlimit: '8',
      prop: 'imageinfo',
      iiprop: 'url|mime|size|extmetadata',
      iiurlwidth: String(WIKIMEDIA_THUMBNAIL_WIDTH),
    });

    const data = await this.fetchJson<WikimediaResponse>(
      `https://commons.wikimedia.org/w/api.php?${params.toString()}`,
    );
    const pages = data?.query?.pages;
    if (!pages) return [];

    const candidates: AssetCandidate[] = [];

    for (const page of Object.values(pages)) {
      const info = page.imageinfo?.[0];
      const mime = info?.mime ?? '';
      if (!info || !mime) continue;

      const title = stripHtml(page.title ?? query);
      const url = selectWikimediaThumbnailUrl(title, info);
      if (!url) continue;

      // An SVG thumbnail from Commons is a PNG render, so it is treated as a
      // raster image and does not need the SVG sanitiser.
      const format: AssetFormat | null = mime.includes('svg')
        ? 'png'
        : mime.includes('png')
          ? 'png'
          : mime.includes('jpeg') || mime.includes('jpg')
            ? 'jpg'
            : mime.includes('webp')
              ? 'webp'
              : null;
      if (!format) continue;

      const licenseName = stripHtml(info?.extmetadata?.['LicenseShortName']?.value ?? '');
      const licenseUrl = stripHtml(info?.extmetadata?.['LicenseUrl']?.value ?? '');
      const artist = stripHtml(info?.extmetadata?.['Artist']?.value ?? '');
      const description = stripHtml(
        info?.extmetadata?.['ImageDescription']?.value ?? '',
      ).slice(0, 500);

      const base: Omit<AssetCandidate, 'score'> = {
        provider: 'wikimedia',
        id: title,
        name: title.replace(/^File:/i, '').replace(/\.[^.]+$/, ''),
        tags: [title, description],
        format,
        colorful: true,
        url,
        license: {
          name: licenseName || 'See Wikimedia Commons',
          ...(licenseUrl ? { url: licenseUrl } : {}),
          ...(artist ? { attribution: artist } : {}),
        },
      };

      candidates.push({ ...base, score: scoreAssetCandidate(base, query) });
    }

    return candidates;
  }

  private async loadOpenMojiIndex(): Promise<OpenMojiEntry[] | null> {
    if (this.openMojiIndex) return this.openMojiIndex;

    const cachePath = path.join(config.assets.cacheDir, 'openmoji-index.json');

    try {
      const stat = fs.statSync(cachePath);
      if (Date.now() - stat.mtimeMs < SEARCH_CACHE_TTL_MS) {
        this.openMojiIndex = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as OpenMojiEntry[];
        return this.openMojiIndex;
      }
    } catch {
      // No usable cache yet.
    }

    const raw = await this.fetchBuffer(OPENMOJI_INDEX_URL, MAX_JSON_BYTES);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw.toString('utf-8')) as unknown;
      if (!Array.isArray(parsed)) return null;
      this.openMojiIndex = parsed.filter(
        (entry): entry is OpenMojiEntry => typeof entry === 'object' && entry !== null,
      );
      fs.mkdirSync(config.assets.cacheDir, { recursive: true });
      fs.writeFileSync(cachePath, raw);
      return this.openMojiIndex;
    } catch (err) {
      console.warn(`[Assets] OpenMoji index unreadable: ${message(err)}`);
      return null;
    }
  }

  // ---- download & storage ---------------------------------------------

  /** If the best URL is throttled or unsafe, try the next confident match. */
  private async persistFirst(
    candidates: AssetCandidate[],
    query: string,
  ): Promise<'downloaded' | 'reused' | 'skipped'> {
    // Try several matches: the top results may all come from a host that is
    // cooling down, while a later Iconify/OpenMoji candidate can still load.
    for (const candidate of candidates.slice(0, 6)) {
      const status = await this.persist(candidate, query);
      if (status !== 'skipped') return status;
    }
    return 'skipped';
  }

  private async persist(
    candidate: AssetCandidate,
    query: string,
  ): Promise<'downloaded' | 'reused' | 'skipped'> {
    // A previous job may already have this exact provider asset. Re-fetching it
    // just to hash the bytes wastes bandwidth and triggers Wikimedia's limiter.
    const alreadyStored = this.loadManifest().some(
      (entry) =>
        entry.provider === candidate.provider &&
        entry.id === candidate.id &&
        fs.existsSync(path.join(config.storage.resourcesDir, entry.relativePath)),
    );
    if (alreadyStored) return 'reused';

    const isSvg = candidate.format === 'svg';
    const limit = isSvg ? config.assets.maxSvgBytes : config.assets.maxRasterBytes;

    const raw = await this.fetchBuffer(candidate.url, limit);
    if (!raw) return 'skipped';

    let body = raw;
    if (isSvg) {
      const cleaned = sanitizeSvg(raw.toString('utf-8'));
      if (!cleaned) {
        console.warn(`[Assets] Rejected unsafe SVG from ${candidate.provider}: ${candidate.id}`);
        return 'skipped';
      }
      body = Buffer.from(cleaned, 'utf-8');
    }

    const manifest = this.loadManifest();
    const sha256 = crypto.createHash('sha256').update(body).digest('hex');

    // Same bytes already downloaded under another query: reuse, do not duplicate.
    const existing = manifest.find((entry) => entry.sha256 === sha256);
    if (existing) return 'reused';

    fs.mkdirSync(config.assets.autoAssetsDir, { recursive: true });
    // Name by the asset's own title, not the search query. The local matcher and
    // verifier read tokens from the file name, so query-based names would make
    // every downloaded file look like it matched the query by definition.
    const stem = (slugify(candidate.name) || slugify(candidate.id) || 'asset').slice(0, 60);
    const fileName = `${stem}-${sha256.slice(0, 8)}.${candidate.format}`;
    const filePath = path.join(config.assets.autoAssetsDir, fileName);
    fs.writeFileSync(filePath, body);

    manifest.push({
      query,
      provider: candidate.provider,
      id: candidate.id,
      relativePath: path.join('auto', fileName).split(path.sep).join('/'),
      format: candidate.format,
      bytes: body.byteLength,
      sha256,
      license: candidate.license,
      downloadedAt: new Date().toISOString(),
    });
    this.saveManifest(manifest);

    console.log(
      `[Assets] ${candidate.provider} "${query}" -> ${fileName} ` +
        `(${candidate.license.name}${candidate.license.attribution ? `, ${candidate.license.attribution}` : ''})`,
    );

    return 'downloaded';
  }

  private loadManifest(): AssetManifestEntry[] {
    if (this.manifest) return this.manifest;

    try {
      const parsed = JSON.parse(
        fs.readFileSync(config.assets.manifestPath, 'utf-8'),
      ) as unknown;
      this.manifest = Array.isArray(parsed)
        ? parsed.filter((entry): entry is AssetManifestEntry => (
            typeof entry === 'object' && entry !== null && typeof (entry as AssetManifestEntry).sha256 === 'string'
          ))
        : [];
    } catch {
      this.manifest = [];
    }

    return this.manifest;
  }

  private saveManifest(manifest: AssetManifestEntry[]): void {
    try {
      fs.mkdirSync(config.assets.cacheDir, { recursive: true });
      fs.writeFileSync(config.assets.manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    } catch (err) {
      console.warn(`[Assets] Could not write the asset manifest: ${message(err)}`);
    }
  }

  /** Human-readable licence list, required by CC BY-SA / CC BY sources. */
  private writeCredits(): void {
    const manifest = this.loadManifest();
    if (manifest.length === 0) return;

    const lines = [
      'EduMotion — downloaded artwork credits',
      '',
      'Downloaded automatically for use inside generated videos.',
      'Reused files are listed once; keep this file with the assets.',
      '',
      ...manifest.map((entry) => {
        const parts = [
          `${entry.relativePath}`,
          `— ${entry.provider}: ${entry.id}`,
          `(${entry.license.name})`,
        ];
        if (entry.license.attribution) parts.push(`by ${entry.license.attribution}`);
        if (entry.license.url) parts.push(entry.license.url);
        return parts.join(' ');
      }),
      '',
    ];

    try {
      fs.mkdirSync(config.assets.autoAssetsDir, { recursive: true });
      fs.writeFileSync(config.assets.creditsPath, lines.join('\n'), 'utf-8');
    } catch (err) {
      console.warn(`[Assets] Could not write credits file: ${message(err)}`);
    }
  }

  private readSearchCache(query: string, allowStale = false): AssetCandidate[] | null {
    const cache = this.loadSearchCache();
    const entry = cache[`${SEARCH_CACHE_VERSION}:${query}`];
    if (!entry) return null;
    if (!allowStale && Date.now() - entry.at > SEARCH_CACHE_TTL_MS) return null;
    return entry.candidates;
  }

  private writeSearchCache(query: string, candidates: AssetCandidate[]): void {
    const cache = this.loadSearchCache();
    cache[`${SEARCH_CACHE_VERSION}:${query}`] = { at: Date.now(), candidates };
    try {
      fs.mkdirSync(config.assets.cacheDir, { recursive: true });
      fs.writeFileSync(config.assets.searchCachePath, JSON.stringify(cache, null, 2), 'utf-8');
    } catch {
      // Search caching is an optimisation only.
    }
  }

  private loadSearchCache(): Record<string, SearchCacheEntry> {
    if (this.searchCache) return this.searchCache;

    try {
      const parsed = JSON.parse(
        fs.readFileSync(config.assets.searchCachePath, 'utf-8'),
      ) as unknown;
      this.searchCache =
        typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
          ? (parsed as Record<string, SearchCacheEntry>)
          : {};
    } catch {
      this.searchCache = {};
    }

    return this.searchCache;
  }

  // ---- http ------------------------------------------------------------

  private async fetchJson<T>(url: string): Promise<T | null> {
    const raw = await this.fetchBuffer(url, MAX_JSON_BYTES);
    if (!raw) return null;

    try {
      return JSON.parse(raw.toString('utf-8')) as T;
    } catch (err) {
      console.warn(`[Assets] Invalid JSON from ${url}: ${message(err)}`);
      return null;
    }
  }

  /** One serial request at a time to Wikimedia; bursty clients get HTTP 429. */
  private async paceWikimediaRequest(url: string): Promise<void> {
    const host = this.hostOf(url);
    if (!host || !this.isWikimediaHost(host)) return;

    const wait = this.lastWikimediaRequestAt + WIKIMEDIA_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await delay(wait);
    this.lastWikimediaRequestAt = Date.now();
  }

  private hostOf(url: string): string | null {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  private isWikimediaHost(host: string): boolean {
    return host === 'wikimedia.org' || host.endsWith('.wikimedia.org');
  }

  /**
   * GET with a hard deadline, per-host cooldown and bounded exponential
   * backoff. A 429 with a short Retry-After is retried in place; a long one
   * puts the host to sleep so callers can use cached or alternative artwork
   * instead of stalling the job.
   */
  private async fetchBuffer(url: string, maxBytes: number): Promise<Buffer | null> {
    if (typeof fetch !== 'function') return null;

    const host = this.hostOf(url);
    if (host && Date.now() < (this.hostBlockedUntil.get(host) ?? 0)) {
      this.failedHosts.add(host);
      return null;
    }

    for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.assets.timeoutMs);
      let retryable = true;

      try {
        await this.paceWikimediaRequest(url);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
          redirect: 'follow',
        });

        if (!response.ok) {
          const status = response.status;
          const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));

          if (status === 429) {
            if (
              retryAfterMs !== null &&
              retryAfterMs <= MAX_INLINE_RETRY_MS &&
              attempt < MAX_FETCH_ATTEMPTS
            ) {
              await delay(retryDelayMs(attempt, retryAfterMs));
              continue;
            }

            if (host) {
              const fallback = this.isWikimediaHost(host)
                ? WIKIMEDIA_COOLDOWN_MS
                : PROVIDER_COOLDOWN_MS;
              const minimum = this.isWikimediaHost(host) ? 30_000 : 10_000;
              const cooldown = Math.min(
                fallback,
                Math.max(minimum, retryAfterMs ?? fallback),
              );
              this.hostBlockedUntil.set(host, Date.now() + cooldown);
              this.failedHosts.add(host);
              console.warn(
                `[Assets] ${host} rate-limited (HTTP 429); cooling down for ` +
                  `${Math.round(cooldown / 1000)}s and using cached or alternative artwork`,
              );
            }
            return null;
          }

          retryable = status >= 500;
          if (retryable && attempt < MAX_FETCH_ATTEMPTS) {
            await delay(retryDelayMs(attempt, retryAfterMs));
            continue;
          }
          throw new Error(`HTTP ${status}`);
        }

        const declared = Number(response.headers.get('content-length') ?? '0');
        if (Number.isFinite(declared) && declared > maxBytes) {
          console.warn(`[Assets] Skipping oversized response (${declared} bytes): ${url}`);
          return null;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.byteLength === 0 || buffer.byteLength > maxBytes) return null;
        return buffer;
      } catch (err) {
        const timedOut = controller.signal.aborted;
        if (attempt === MAX_FETCH_ATTEMPTS || !retryable || timedOut) {
          if (host) this.failedHosts.add(host);
          console.warn(`[Assets] Download failed: ${url} — ${message(err)}`);
          return null;
        }
        await delay(retryDelayMs(attempt, null));
      } finally {
        clearTimeout(timer);
      }
    }

    return null;
  }
}

export const assetDiscovery = new AssetDiscoveryService();
