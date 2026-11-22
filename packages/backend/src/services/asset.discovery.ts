import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
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
const SEARCH_CACHE_VERSION = 'v2';
const OPENMOJI_VERSION = '15.1.0';
const OPENMOJI_INDEX_URL =
  `https://cdn.jsdelivr.net/npm/openmoji@${OPENMOJI_VERSION}/data/openmoji.json`;
const OPENMOJI_SVG_BASE = `https://cdn.jsdelivr.net/npm/openmoji@${OPENMOJI_VERSION}/color/svg`;
const MAX_JSON_BYTES = 8 * 1024 * 1024;

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

/** Higher is better: how much of the query the candidate actually covers. */
export function scoreAssetCandidate(
  candidate: Omit<AssetCandidate, 'score'>,
  query: string,
): number {
  const queryTokens = new Set(tokenizeText(query));
  if (queryTokens.size === 0) return 0;

  const candidateTokens = new Set([
    ...tokenizeText(candidate.name),
    ...candidate.tags.flatMap((tag) => tokenizeText(tag)),
  ]);

  let matched = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) matched++;
  }

  const providerWeight =
    candidate.provider === 'iconify' ? 1 : candidate.provider === 'openmoji' ? 0.95 : 0.8;
  const exact = candidate.name.toLowerCase().trim() === query.toLowerCase().trim() ? 0.2 : 0;

  return Number((Math.min(1, matched / queryTokens.size) * providerWeight + exact).toFixed(3));
}

class AssetDiscoveryService {
  private searchCache: Record<string, SearchCacheEntry> | null = null;
  private manifest: AssetManifestEntry[] | null = null;
  private openMojiIndex: OpenMojiEntry[] | null = null;
  private collectionLicenses: Record<string, AssetLicense> | null = null;

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
        const best = candidates[0];

        if (!best) {
          summary.skipped++;
          continue;
        }

        const status = await this.persist(best, query);
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
        const best = candidates[0];
        if (!best) {
          summary.skipped++;
          continue;
        }
        const status = await this.persist(best, query);
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

  /** First provider that knows the query wins; results are cached for a week. */
  private async discover(query: string): Promise<AssetCandidate[]> {
    const cached = this.readSearchCache(query);
    if (cached) return cached;

    for (const provider of config.assets.providers) {
      let candidates: AssetCandidate[] = [];

      if (provider === 'iconify') candidates = await this.searchIconify(query);
      else if (provider === 'openmoji') candidates = await this.searchOpenMoji(query);
      else if (provider === 'wikimedia') candidates = await this.searchWikimedia(query);

      if (candidates.length === 0) continue;

      const ranked = [...candidates].sort((a, b) => b.score - a.score);
      this.writeSearchCache(query, ranked);
      return ranked;
    }

    this.writeSearchCache(query, []);
    return [];
  }

  // ---- providers -------------------------------------------------------

  private async searchIconify(query: string): Promise<AssetCandidate[]> {
    const data = await this.fetchJson<{ icons?: unknown }>(
      `https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=10`,
    );
    if (!data || !Array.isArray(data.icons)) return [];

    const parsedIcons: Array<{ prefix: string; name: string }> = [];

    for (const icon of data.icons.slice(0, 8)) {
      if (typeof icon !== 'string') continue;
      const [prefix, name] = icon.split(':');
      if (!prefix || !name) continue;
      parsedIcons.push({ prefix, name });
    }
    if (parsedIcons.length === 0) return [];

    // Iconify publishes each set's real licence; resolve unknown prefixes once
    // instead of writing "See icon set" into the credits file.
    const licenses = await this.loadCollectionLicenses([
      ...new Set(parsedIcons.map((icon) => icon.prefix)),
    ]);

    return parsedIcons.map(({ prefix, name }) => {
      const base: Omit<AssetCandidate, 'score'> = {
        provider: 'iconify',
        id: `${prefix}:${name}`,
        name: name.replace(/-/g, ' '),
        tags: [prefix, name.replace(/-/g, ' '), query],
        format: 'svg',
        // White tint: the tiles sit on saturated backgrounds, and a raw
        // `currentColor` icon would render black inside a data URL.
        url: `https://api.iconify.design/${prefix}/${name}.svg?height=360&color=%23ffffff`,
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
        const hits = tags.filter((tag) => queryTokens.has(tag)).length;
        return { entry, tags, hits };
      })
      .filter((item) => item.hits > 0 && typeof item.entry.hexcode === 'string')
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 3);

    return scored.map(({ entry, tags, hits }) => ({
      provider: 'openmoji' as const,
      id: entry.hexcode ?? '',
      name: entry.annotation ?? entry.hexcode ?? 'openmoji',
      tags,
      format: 'svg' as const,
      url: `${OPENMOJI_SVG_BASE}/${entry.hexcode ?? ''}.svg`,
      license: OPENMOJI_LICENSE,
      score: Number((Math.min(1, hits / queryTokens.size) * 0.95).toFixed(3)),
    }));
  }

  private async searchWikimedia(query: string): Promise<AssetCandidate[]> {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      origin: '*',
      generator: 'search',
      gsrnamespace: '6',
      gsrsearch: `${query} filetype:bitmap`,
      gsrlimit: '6',
      prop: 'imageinfo',
      iiprop: 'url|mime|extmetadata',
      iiurlwidth: '900',
    });

    const data = await this.fetchJson<WikimediaResponse>(
      `https://commons.wikimedia.org/w/api.php?${params.toString()}`,
    );
    const pages = data?.query?.pages;
    if (!pages) return [];

    const candidates: AssetCandidate[] = [];

    for (const page of Object.values(pages)) {
      const info = page.imageinfo?.[0];
      const url = info?.thumburl ?? info?.url;
      const mime = info?.mime ?? '';
      if (!url || !mime) continue;

      const format: AssetFormat | null = mime.includes('svg')
        ? 'svg'
        : mime.includes('png')
          ? 'png'
          : mime.includes('jpeg') || mime.includes('jpg')
            ? 'jpg'
            : mime.includes('webp')
              ? 'webp'
              : null;
      if (!format) continue;

      const title = stripHtml(page.title ?? query);
      const licenseName = stripHtml(info?.extmetadata?.['LicenseShortName']?.value ?? '');
      const licenseUrl = stripHtml(info?.extmetadata?.['LicenseUrl']?.value ?? '');
      const artist = stripHtml(info?.extmetadata?.['Artist']?.value ?? '');

      const base: Omit<AssetCandidate, 'score'> = {
        provider: 'wikimedia',
        id: title,
        name: title.replace(/^File:/i, '').replace(/\.[^.]+$/, ''),
        tags: [query, title],
        format,
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

  private async persist(
    candidate: AssetCandidate,
    query: string,
  ): Promise<'downloaded' | 'reused' | 'skipped'> {
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
    const fileName = `${slugify(query) || 'asset'}-${sha256.slice(0, 8)}.${candidate.format}`;
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

  private readSearchCache(query: string): AssetCandidate[] | null {
    const cache = this.loadSearchCache();
    const entry = cache[`${SEARCH_CACHE_VERSION}:${query}`];
    if (!entry) return null;
    if (Date.now() - entry.at > SEARCH_CACHE_TTL_MS) return null;
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

  /** GET with a hard deadline and one retry; null instead of an exception. */
  private async fetchBuffer(url: string, maxBytes: number): Promise<Buffer | null> {
    if (typeof fetch !== 'function') return null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.assets.timeoutMs);

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
          redirect: 'follow',
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const declared = Number(response.headers.get('content-length') ?? '0');
        if (Number.isFinite(declared) && declared > maxBytes) {
          console.warn(`[Assets] Skipping oversized response (${declared} bytes): ${url}`);
          return null;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.byteLength === 0 || buffer.byteLength > maxBytes) return null;
        return buffer;
      } catch (err) {
        if (attempt === 2) {
          console.warn(`[Assets] Download failed: ${url} — ${message(err)}`);
          return null;
        }
        await delay(300 * attempt);
      } finally {
        clearTimeout(timer);
      }
    }

    return null;
  }
}

export const assetDiscovery = new AssetDiscoveryService();
