import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config, type AssetVerifyMode } from '../config.js';
import { isVisionConfigured, visionModelName, visionService } from './vision.service.js';
import { mappedTokens } from './text.language.js';
import type { MatchedAsset } from './asset.library.js';
import { verifyAssetMatch, type AssetVerdict } from './asset.verify.js';

/**
 * Artwork verification in front of the built-in glyph fallback.
 *
 * The install runs two models with separate jobs:
 *  - the main local model (`LLM_MODEL_NAME`) writes the script and slides;
 *  - the vision model (`VISION_API_URL`/`VISION_MODEL`) looks at artwork.
 *
 * Artwork is only ever judged by the vision model, because a file name cannot
 * tell you that a museum painting titled "…the corner of a…" is not a cube. The
 * main script model is deliberately not asked: it never sees the image, and
 * using it here made verification a slow filename lookup on the same model that
 * is busy writing scripts.
 *
 * The deterministic verifier still runs first and its rejections are final
 * (backdrop, no scene term, generic-only file, conflicting subject field): no
 * model can talk the pipeline into attaching a satellite to a geometry lesson.
 *
 * Modes (`ASSET_VERIFY`):
 *  - `auto` (default): deterministic rules, then the vision model for every
 *    accepted candidate; falls back to the rules when no endpoint is set.
 *  - `vision`: same as `auto` (the legacy `llm` value also maps here).
 *  - `tags`: deterministic rules only; never calls a model.
 *
 * Verdicts are cached by a content hash that includes the judging model, so a
 * repeated topic never pays for the same call twice.
 */

const CACHE_VERSION = 2;
const MAX_CACHE_ENTRIES = 2000;

export type JudgeSource = 'tags' | 'vision' | 'cache';

export type AssetAudit = (
  dataUrl: string,
  need: { label: string; keyTerms: string[]; narration?: string },
) => Promise<{ match: boolean; reason: string } | null>;

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

export interface AssetJudgeOptions {
  mode?: AssetVerifyMode;
  cachePath?: string;
  /** Test seam; defaults to the configured vision model. */
  audit?: AssetAudit;
  /** Test seam; defaults to "a vision endpoint is configured and enabled". */
  visionAvailable?: () => boolean;
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

/**
 * A Marathi/Hindi tile label is what the picture has to illustrate, but the
 * vision prompt about artwork is in English. Add the known English meaning so
 * the model compares meanings instead of reading an opaque script.
 */
function glossLabel(label: string): string {
  if (/[a-z0-9]/i.test(label)) return label;
  const english = mappedTokens(label)
    .filter((token) => /^[a-z0-9]+$/.test(token))
    .slice(0, 6)
    .join(', ');
  return english ? `${label} (${english})` : label;
}

function cacheKey(match: MatchedAsset, context: AssetJudgeContext): string {
  const payload = JSON.stringify({
    v: CACHE_VERSION,
    // A different vision model may judge the same picture differently, so its
    // name is part of the key.
    model: visionModelName(),
    scene: [...new Set(context.keyTerms.map(normalize))].filter(Boolean).sort(),
    label: normalize(context.label),
    candidate: match.id,
    tokens: [...new Set(match.tokens.map(normalize))].filter(Boolean).sort(),
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export class AssetJudge {
  private readonly mode: AssetVerifyMode;
  private readonly cachePath: string;
  private readonly audit: AssetAudit;
  private readonly visionAvailable: () => boolean;
  private cache: Record<string, CacheEntry> | null = null;
  private warnedNoVision = false;

  constructor(options: AssetJudgeOptions = {}) {
    this.mode = options.mode ?? config.assets.verify.mode;
    this.cachePath = options.cachePath ?? config.assets.verify.cachePath;
    this.audit = options.audit ?? ((dataUrl, need) => visionService.audit(dataUrl, need));
    this.visionAvailable = options.visionAvailable
      ?? (() => config.assets.verify.vision && isVisionConfigured());
  }

  getMode(): AssetVerifyMode {
    return this.mode;
  }

  async verify(match: MatchedAsset, context: AssetJudgeContext): Promise<JudgeVerdict> {
    const rule = verifyAssetMatch(
      match,
      context.keyTerms,
      `${context.label} ${context.narration ?? ''}`,
    );

    // Deterministic rejections are final in every mode.
    if (!rule.accepted) return { ...rule, source: 'tags' };
    if (this.mode === 'tags') return { ...rule, source: 'tags' };

    if (!this.visionAvailable()) {
      if (!this.warnedNoVision) {
        console.warn(
          '[Assets] No vision endpoint configured (VISION_API_URL/VISION_MODEL); ' +
            'artwork is accepted on file-name rules only. The script model is never ' +
            'used to verify artwork.',
        );
        this.warnedNoVision = true;
      }
      return { ...rule, source: 'tags' };
    }

    const key = cacheKey(match, context);
    const cached = this.read(key);
    if (cached) return { ...cached.verdict, source: 'cache' };

    const audit = await this.audit(match.dataUrl, {
      label: glossLabel(context.label),
      keyTerms: context.keyTerms,
      ...(context.narration ? { narration: context.narration } : {}),
    });

    // An unreachable or unusable endpoint must not cost the job its artwork, so
    // the deterministic verdict stands rather than turning into a rejection.
    if (!audit) return { ...rule, source: 'tags' };

    const verdict: AssetVerdict = {
      accepted: audit.match,
      reason: `${audit.match ? 'Vision accepted' : 'Vision rejected'}: ${audit.reason}`,
      matchedTerms: rule.matchedTerms,
      conflicts: rule.conflicts,
    };
    this.write(key, verdict);
    return { ...verdict, source: 'vision' };
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
