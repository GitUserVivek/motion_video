import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config, type AssetVerifyMode } from '../config.js';
import { llmService, type LlmMessage } from './llm.service.js';
import type { MatchedAsset } from './asset.library.js';
import {
  isConfidentVerdict,
  verifyAssetMatch,
  type AssetVerdict,
} from './asset.verify.js';

/**
 * Optional semantic judge for artwork selection.
 *
 * The deterministic verifier is intentionally strict and cheap, but it cannot
 * tell a geometric "cube" from a spacecraft called "Mars Cube One" using words
 * alone when the shared word is the whole name. This judge asks the local model
 * only for the cases the rules mark ambiguous (or for every accepted candidate
 * when explicitly configured), and caches each verdict by a content hash so a
 * repeated topic never pays for the same call twice.
 *
 * Modes (`ASSET_VERIFY`):
 *  - `auto` (default): deterministic rules; LLM only for ambiguous accepts.
 *  - `llm`: ask the model for every accepted candidate; deterministic fallback.
 *  - `tags`: deterministic rules only; never loads the model.
 *
 * Deterministic rejections (backdrop, no scene term, generic-only file,
 * conflicting subject field) are final in every mode: a model cannot talk the
 * pipeline into attaching a satellite to a geometry lesson.
 */

const CACHE_VERSION = 1;
const MAX_CACHE_ENTRIES = 2000;

export type JudgeSource = 'tags' | 'llm' | 'cache';

export interface JudgeVerdict extends AssetVerdict {
  source: JudgeSource;
}

export interface AssetJudgeContext {
  keyTerms: string[];
  /** The tile/step/object label the image would illustrate. */
  label: string;
  /** Scene narration, used only to disambiguate the model prompt. */
  narration?: string;
  sceneId?: string;
}

export type AssetJudgeChat = (
  messages: LlmMessage[],
  options?: { temperature?: number; num_predict?: number },
) => Promise<string>;

export interface AssetJudgeOptions {
  mode?: AssetVerifyMode;
  cachePath?: string;
  /** Test seam; defaults to `llmService.isModelAvailable()`. */
  modelAvailable?: () => boolean;
  /** Test seam; defaults to `llmService.chat`. */
  chat?: AssetJudgeChat;
}

interface CacheEntry {
  at: number;
  verdict: AssetVerdict;
}

interface CacheFile {
  version: number;
  entries: Record<string, CacheEntry>;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function cacheKey(match: MatchedAsset, context: AssetJudgeContext): string {
  const payload = JSON.stringify({
    v: CACHE_VERSION,
    // A different model may judge differently, so its name is part of the key.
    model: config.localLlm.modelName,
    scene: [...new Set(context.keyTerms.map(normalize))].filter(Boolean).sort(),
    label: normalize(context.label),
    candidate: match.id,
    tokens: [...new Set(match.tokens.map(normalize))].filter(Boolean).sort(),
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function buildPrompt(match: MatchedAsset, context: AssetJudgeContext): LlmMessage[] {
  const terms = [...new Set(context.keyTerms)].slice(0, 20).join(', ');
  const tokens = [...new Set(match.tokens)].slice(0, 20).join(', ');
  const narration = (context.narration ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);

  return [
    {
      role: 'system',
      content:
        'You verify artwork for an educational video. Decide whether an image ' +
        'depicts the element being illustrated in the scene\'s meaning. ' +
        'Reply with one JSON object and nothing else.',
    },
    {
      role: 'user',
      content: [
        `Scene concept words: ${terms || '(none)'}`,
        `Element being illustrated: "${context.label}"`,
        `Image name: "${match.id}"`,
        `Image words: ${tokens || '(none)'}`,
        ...(narration ? [`Scene narration: "${narration}"`] : []),
        '',
        'A shared word is not enough: a spacecraft called "Mars Cube One" is not',
        'a geometric cube, and a workplace "hierarchy of control" chart is not a',
        'geometric pyramid. If the image is about a different subject, reject it.',
        '',
        'Reply exactly: {"match": true|false, "reason": "max 20 words"}',
      ].join('\n'),
    },
  ];
}

/** Extract the first strict JSON object; returns null on any malformed reply. */
function parseJudgeReply(
  raw: string,
  rule: AssetVerdict,
): AssetVerdict | null {
  const object = /\{[\s\S]*?\}/.exec(raw);
  if (!object) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(object[0]);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const record = parsed as { match?: unknown; reason?: unknown };
  if (typeof record.match !== 'boolean') return null;

  const reason = typeof record.reason === 'string' && record.reason.trim()
    ? record.reason.trim().slice(0, 160)
    : record.match
      ? 'the image depicts the element'
      : 'the image is about something else';

  return {
    accepted: record.match,
    reason: `${record.match ? 'LLM accepted' : 'LLM rejected'}: ${reason}`,
    matchedTerms: rule.matchedTerms,
    conflicts: rule.conflicts,
  };
}

export class AssetJudge {
  private readonly mode: AssetVerifyMode;
  private readonly cachePath: string;
  private readonly modelAvailable: () => boolean;
  private readonly chat: AssetJudgeChat;
  private cache: Record<string, CacheEntry> | null = null;

  constructor(options: AssetJudgeOptions = {}) {
    this.mode = options.mode ?? config.assets.verify.mode;
    this.cachePath = options.cachePath ?? config.assets.verify.cachePath;
    this.modelAvailable = options.modelAvailable ?? (() => llmService.isModelAvailable());
    this.chat = options.chat ?? ((messages, chatOptions) => llmService.chat(messages, chatOptions));
  }

  getMode(): AssetVerifyMode {
    return this.mode;
  }

  async verify(match: MatchedAsset, context: AssetJudgeContext): Promise<JudgeVerdict> {
    const rule = verifyAssetMatch(match, context.keyTerms);

    // Deterministic rejections are final in every mode.
    if (!rule.accepted) return { ...rule, source: 'tags' };
    if (this.mode === 'tags') return { ...rule, source: 'tags' };

    const confident = isConfidentVerdict(rule, match, context.keyTerms);
    if (this.mode === 'auto' && confident) return { ...rule, source: 'tags' };

    const key = cacheKey(match, context);
    const cached = this.read(key);
    if (cached) return { ...cached.verdict, source: 'cache' };

    if (!this.modelAvailable()) {
      if (this.mode === 'llm') {
        console.warn(
          `[Assets] ASSET_VERIFY=llm but the local model is not available; ` +
            `using deterministic tags for ${match.id}`,
        );
      }
      return { ...rule, source: 'tags' };
    }

    let judged: AssetVerdict | null = null;
    try {
      const raw = await this.chat(buildPrompt(match, context), {
        temperature: 0,
        num_predict: 120,
      });
      judged = parseJudgeReply(raw, rule);
      if (!judged) {
        console.warn(`[Assets] Semantic judge returned no usable JSON for ${match.id}`);
      }
    } catch (err) {
      console.warn(
        `[Assets] Semantic judge failed for ${match.id}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }

    if (!judged) return { ...rule, source: 'tags' };

    this.write(key, judged);
    return { ...judged, source: 'llm' };
  }

  private read(key: string): CacheEntry | null {
    const cache = this.load();
    const entry = cache[key];
    return entry && Number.isFinite(entry.at) ? entry : null;
  }

  private write(key: string, verdict: AssetVerdict): void {
    const cache = this.load();
    cache[key] = { at: Date.now(), verdict };

    // Bound the file so a long-running install cannot grow it forever.
    const entries = Object.entries(cache);
    if (entries.length > MAX_CACHE_ENTRIES) {
      entries
        .sort(([, a], [, b]) => b.at - a.at)
        .slice(MAX_CACHE_ENTRIES)
        .forEach(([stale]) => delete cache[stale]);
    }

    try {
      fs.mkdirSync(path.dirname(this.cachePath), { recursive: true });
      const file: CacheFile = { version: CACHE_VERSION, entries: cache };
      fs.writeFileSync(this.cachePath, JSON.stringify(file, null, 2), 'utf-8');
    } catch (err) {
      console.warn(
        `[Assets] Could not write the semantic cache: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  private load(): Record<string, CacheEntry> {
    if (this.cache) return this.cache;

    try {
      const parsed = JSON.parse(fs.readFileSync(this.cachePath, 'utf-8')) as unknown;
      if (
        parsed
        && typeof parsed === 'object'
        && (parsed as CacheFile).version === CACHE_VERSION
        && (parsed as CacheFile).entries
        && typeof (parsed as CacheFile).entries === 'object'
      ) {
        const entries = (parsed as CacheFile).entries;
        this.cache = Object.fromEntries(
          Object.entries(entries).filter(([, entry]) => (
            entry
            && typeof entry === 'object'
            && Number.isFinite(entry.at)
            && entry.verdict
            && typeof entry.verdict.accepted === 'boolean'
          )),
        );
        return this.cache;
      }
    } catch {
      // No usable cache yet.
    }

    this.cache = {};
    return this.cache;
  }
}

export const assetJudge = new AssetJudge();
