import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import type { ResearchSource } from '@edumotion/shared';

/**
 * Optional, keyless fact research.
 *
 * The video must work offline, so research is best-effort: a failed lookup is
 * recorded and the caller keeps the claim marked unverified. Only official
 * REST APIs are used (no HTML scraping), and the result keeps the page title,
 * URL and licence so the UI/logs can say where a fact came from.
 */
export interface ResearchResult {
  enabled: boolean;
  provider: string;
  sources: ResearchSource[];
  errors: string[];
}

const WIKI_SUMMARY = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const WIKI_SEARCH = 'https://en.wikipedia.org/w/api.php';

interface CacheEntry {
  at: number;
  source: ResearchSource | null;
}

class ResearchService {
  private memory = new Map<string, CacheEntry>();

  private cachePath(query: string): string {
    const hash = crypto.createHash('sha1').update(query.trim().toLowerCase()).digest('hex');
    return path.join(config.research.cacheDir, `${hash}.json`);
  }

  private readCache(query: string): ResearchSource | null | undefined {
    const memory = this.memory.get(query);
    if (memory && Date.now() - memory.at < 7 * 24 * 60 * 60 * 1000) return memory.source;

    try {
      const raw = fs.readFileSync(this.cachePath(query), 'utf-8');
      const parsed = JSON.parse(raw) as { source: ResearchSource | null };
      this.memory.set(query, { at: Date.now(), source: parsed.source });
      return parsed.source;
    } catch {
      return undefined;
    }
  }

  private writeCache(query: string, source: ResearchSource | null): void {
    this.memory.set(query, { at: Date.now(), source });
    try {
      fs.mkdirSync(config.research.cacheDir, { recursive: true });
      fs.writeFileSync(
        this.cachePath(query),
        JSON.stringify({ query, source, cachedAt: new Date().toISOString() }, null, 2),
        'utf-8',
      );
    } catch {
      // Cache write failure must never fail a video.
    }
  }

  private async fetchJson(url: string): Promise<Record<string, unknown> | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.research.timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'EduMotion/2.0 (local educational video generator)',
        },
      });
      if (!response.ok) return null;
      return (await response.json()) as Record<string, unknown>;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async lookupWikipedia(query: string): Promise<ResearchSource | null> {
    const cached = this.readCache(query);
    if (cached !== undefined) return cached;

    const direct = await this.fetchJson(`${WIKI_SUMMARY}${encodeURIComponent(query)}`);
    let page = direct;

    if (!page || typeof page['extract'] !== 'string') {
      const searchUrl =
        `${WIKI_SEARCH}?action=query&list=search&srsearch=${encodeURIComponent(query)}` +
        '&srlimit=1&format=json&origin=*';
      const search = await this.fetchJson(searchUrl);
      const results = (search?.['query'] as { search?: Array<{ title?: unknown }> } | undefined)
        ?.search;
      const title = Array.isArray(results) && typeof results[0]?.title === 'string'
        ? results[0].title
        : null;
      page = title ? await this.fetchJson(`${WIKI_SUMMARY}${encodeURIComponent(title)}`) : null;
    }

    const extract = typeof page?.['extract'] === 'string' ? page['extract'].trim() : '';
    if (!page || extract.length === 0) {
      this.writeCache(query, null);
      return null;
    }

    const title = typeof page['title'] === 'string' ? page['title'] : query;
    const contentUrls = page['content_urls'] as
      | { desktop?: { page?: unknown } }
      | undefined;
    const pageUrl = typeof contentUrls?.desktop?.page === 'string'
      ? contentUrls.desktop.page
      : `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

    const source: ResearchSource = {
      provider: 'wikipedia',
      title,
      url: pageUrl,
      extract: extract.slice(0, 2500),
      retrievedAt: new Date().toISOString(),
      licence: 'CC BY-SA 4.0 (Wikipedia)',
    };
    this.writeCache(query, source);
    return source;
  }

  /** Look up several queries, de-duplicated by page title/URL. */
  async gather(queries: string[]): Promise<ResearchResult> {
    const provider = config.research.provider;
    if (provider === 'none' || provider === 'off' || provider === 'disabled') {
      return { enabled: false, provider, sources: [], errors: [] };
    }
    if (provider !== 'wikipedia') {
      return {
        enabled: false,
        provider,
        sources: [],
        errors: [`Unsupported research provider "${provider}"`],
      };
    }

    const sources: ResearchSource[] = [];
    const errors: string[] = [];
    const seen = new Set<string>();
    const unique = [...new Set(queries.map((query) => query.trim()).filter(Boolean))];

    for (const query of unique) {
      if (sources.length >= config.research.maxSources) break;
      const source = await this.lookupWikipedia(query);
      if (!source) {
        errors.push(`No research result for "${query}"`);
        continue;
      }
      const key = source.url;
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push(source);
    }

    return { enabled: true, provider, sources, errors };
  }
}

export const researchService = new ResearchService();
