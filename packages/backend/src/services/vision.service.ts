import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

/**
 * Optional image understanding for user-uploaded artwork.
 *
 * The app deliberately keeps its default path offline: a filename/label
 * fallback always works. When a free OpenAI-compatible vision endpoint is
 * configured (for example a local Qwen2.5-VL server, OpenRouter free model, or
 * Gemini's free OpenAI-compatible endpoint), the image is captioned and tagged
 * once and the result is stored with the script asset.
 */

export interface ImageMetadata {
  caption: string;
  keywords: string[];
  source: 'filename' | 'vision';
}

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'these', 'those',
  'image', 'images', 'photo', 'photos', 'picture', 'pictures', 'img', 'dsc',
  'screenshot', 'screenshots', 'final', 'copy', 'new', 'edited', 'upload',
  'a', 'an', 'of', 'to', 'in', 'on', 'at', 'by', 'is', 'are', 'be', 'it',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function cleanName(fileName: string): string {
  const stem = path.basename(fileName, path.extname(fileName));
  return stem
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b(?:img|dsc|image|photo|screenshot)[\s-]*\d+\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const clean = value.trim().replace(/\s+/g, ' ');
    if (clean.length < 2) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= 12) break;
  }
  return out;
}

/** Deterministic fallback when no vision endpoint is configured or reachable. */
export function fallbackMetadata(fileName: string, label?: string): ImageMetadata {
  const labelText = label?.trim() ?? '';
  const nameText = cleanName(fileName);
  const caption = labelText || nameText || path.basename(fileName);
  const keywords = unique([
    ...tokenize(labelText),
    ...tokenize(nameText),
    ...(caption ? [caption] : []),
  ]);
  return { caption, keywords, source: 'filename' };
}

function isConfigured(): boolean {
  const provider = (config.vision.provider || 'auto').toLowerCase();
  if (provider === 'none' || provider === 'off' || provider === 'false') return false;
  return Boolean(config.vision.apiUrl && config.vision.model);
}

/** True when a separate vision model is available to look at downloaded artwork. */
export function isVisionConfigured(): boolean {
  return isConfigured();
}

/** Identity of the auditing model, part of the asset-verification cache key. */
export function visionModelName(): string {
  return config.vision.model || 'vision';
}

function endpoint(): string {
  const url = config.vision.apiUrl.replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(url)) return url;
  if (/\/v1$/i.test(url) || /\/v1beta\/openai$/i.test(url)) return `${url}/chat/completions`;
  return url;
}

function dataUrlFor(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) return null;
  try {
    return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
  } catch {
    return null;
  }
}

function parseVisionJson(content: unknown): { caption?: string; keywords?: string[] } {
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
            return (part as { text: string }).text;
          }
          return '';
        })
        .join(' ')
      : '';

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    const parsed = JSON.parse(match[0]) as {
      caption?: unknown;
      keywords?: unknown;
      subjects?: unknown;
    };
    const caption = typeof parsed.caption === 'string' ? parsed.caption.trim() : undefined;
    const values = [
      ...(Array.isArray(parsed.keywords) ? parsed.keywords : []),
      ...(Array.isArray(parsed.subjects) ? parsed.subjects : []),
    ].filter((value): value is string => typeof value === 'string');
    return {
      ...(caption ? { caption } : {}),
      ...(values.length > 0 ? { keywords: unique(values) } : {}),
    };
  } catch {
    return {};
  }
}

/** What a vision model saw in one candidate image. */
export interface ImageAudit {
  match: boolean;
  reason: string;
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
        return (part as { text: string }).text;
      }
      return '';
    })
    .join(' ');
}

function parseAuditJson(content: unknown): ImageAudit | null {
  const text = textOf(content);

  const match = /\{[\s\S]*\}/.exec(text);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]) as { match?: unknown; reason?: unknown };
    if (typeof parsed.match !== 'boolean') return null;
    const reason = typeof parsed.reason === 'string' && parsed.reason.trim()
      ? parsed.reason.trim().slice(0, 160)
      : parsed.match
        ? 'the image shows the element'
        : 'the image shows something else';
    return { match: parsed.match, reason };
  } catch {
    return null;
  }
}

/** Cheap English stemming so "angle"/"angled"/"angles" compare equal. */
function stem(word: string): string {
  return word.length > 4 ? word.replace(/(?:ies|ing|ed|es|s)$/, '') : word;
}

function conceptWords(need: { label: string; keyTerms?: string[] }): Set<string> {
  return new Set(
    [...tokenize(need.label), ...(need.keyTerms ?? []).flatMap((term) => tokenize(term))]
      .map(stem)
      .filter((word) => word.length > 2),
  );
}

/**
 * Captioning models (moondream and friends) answer with a description instead
 * of the requested JSON. The description is still evidence: the picture matches
 * when the model itself named one of the concepts the scene needs, and it does
 * not when none of them appear in what the model saw.
 */
export function captionVerdict(
  content: unknown,
  need: { label: string; keyTerms?: string[] },
): ImageAudit | null {
  const caption = textOf(content).replace(/\s+/g, ' ').trim();
  if (!caption) return null;

  const wanted = conceptWords(need);
  if (wanted.size === 0) return null;

  const seen = new Set(tokenize(caption).map(stem));
  const hits = [...wanted].filter((word) => seen.has(word));
  const evidence = caption.slice(0, 120);

  return hits.length > 0
    ? { match: true, reason: `it shows ${hits.slice(0, 3).join(', ')} (${evidence})` }
    : { match: false, reason: `it shows something else (${evidence})` };
}

class VisionService {
  private warnedMissingConfig = false;
  /** Stop calling a broken endpoint after a few failures in the same run. */
  private auditFailures = 0;
  private auditDisabled = false;

  /**
   * Describe an image and return searchable metadata. Never throws: a failed
   * model call must not prevent a user's upload from being used.
   */
  async identify(filePath: string, fileName: string, label?: string): Promise<ImageMetadata> {
    const fallback = fallbackMetadata(fileName, label);
    if (!isConfigured()) {
      if (!this.warnedMissingConfig) {
        console.log(
          '[Vision] VISION_API_URL/VISION_MODEL not configured; using filename and user labels.',
        );
        this.warnedMissingConfig = true;
      }
      return fallback;
    }

    const dataUrl = dataUrlFor(filePath);
    if (!dataUrl) return fallback;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.vision.timeoutMs);
    try {
      const response = await fetch(endpoint(), {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(config.vision.apiKey ? { Authorization: `Bearer ${config.vision.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: config.vision.model,
          temperature: 0.1,
          max_tokens: 220,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text:
                    'Identify this image for an educational video. Return only JSON with ' +
                    '{"caption":"one short sentence","keywords":["3-8 concrete visual nouns"]}. ' +
                    'Do not identify people by name and do not guess private information.',
                },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const parsed = parseVisionJson(payload.choices?.[0]?.message?.content);
      const caption = parsed.caption || fallback.caption;
      const keywords = unique([
        ...(parsed.keywords ?? []),
        ...fallback.keywords,
      ]);
      return { caption, keywords, source: 'vision' };
    } catch (err) {
      console.warn(
        `[Vision] Could not identify ${fileName}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      return fallback;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Ask the vision model whether this exact picture illustrates the element the
   * scene needs.
   *
   * Filename and tag checks cannot see that a museum painting titled "…the
   * corner of a…" is not a cube; a model looking at the pixels can. Returns null
   * whenever the endpoint is unset, unreachable or answers unusably, so the
   * deterministic and text-verification paths still decide.
   */
  async audit(
    dataUrl: string,
    need: { label: string; keyTerms?: string[]; narration?: string },
  ): Promise<ImageAudit | null> {
    if (!isConfigured() || this.auditDisabled) return null;
    // OpenAI-compatible endpoints accept raster images, not SVG. Vector icons
    // are also the artwork whose name describes it most reliably, so skipping
    // them costs little and keeps a 400 from disabling the audit for the run.
    if (!/^data:image\/(?:png|jpe?g|webp)[;,]/i.test(dataUrl)) return null;

    const label = need.label.replace(/\s+/g, ' ').trim().slice(0, 120);
    const terms = [...new Set(need.keyTerms ?? [])].slice(0, 12).join(', ');
    const narration = (need.narration ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.vision.timeoutMs);
    try {
      const response = await fetch(endpoint(), {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(config.vision.apiKey ? { Authorization: `Bearer ${config.vision.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: config.vision.model,
          temperature: 0,
          max_tokens: 160,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: [
                    'You check artwork for an educational video. Look at the image only.',
                    `It would illustrate: "${label}".`,
                    terms ? `Scene concept words: ${terms}.` : '',
                    narration ? `Scene narration: "${narration}".` : '',
                    'Answer whether the image itself shows that concept. A shared word is',
                    'not enough: a photo of a spacecraft called "Mars Cube One" is not a',
                    'geometric cube, a painting that merely mentions a corner is not a',
                    'geometry diagram, and a decorative picture with no clear subject of',
                    'the concept is not usable.',
                    'Return only JSON: {"match": true|false, "reason": "max 20 words"}.',
                    'If you cannot answer in JSON, describe what the picture shows in one',
                    'sentence instead.',
                  ].filter(Boolean).join('\n'),
                },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      const audit = parseAuditJson(content) ?? captionVerdict(content, need);
      if (!audit) throw new Error('the reply was empty');

      this.auditFailures = 0;
      return audit;
    } catch (err) {
      // A brief network blip should not lose the audit for the whole job, but a
      // persistently broken endpoint must stop adding a timeout to every tile.
      this.auditFailures++;
      if (this.auditFailures >= 3) {
        this.auditDisabled = true;
        console.warn(
          '[Vision] Asset auditing disabled for this run after repeated failures; ' +
            'falling back to filename/LLM verification.',
        );
      }
      console.warn(
        `[Vision] Could not audit artwork: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

export const visionService = new VisionService();
