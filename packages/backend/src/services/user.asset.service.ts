import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { ScriptAsset, ScriptAssetUpload } from '@edumotion/shared';
import { getDb } from '../db/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { config } from '../config.js';
import { fallbackMetadata, visionService, type ImageMetadata } from './vision.service.js';

export interface UserAsset {
  id: string;
  fileName: string;
  mimeType: string;
  caption: string;
  keywords: string[];
  label?: string;
  dataUrl: string;
  /** Audit identifier used in `assets.json` and the render preview. */
  assetPath: string;
}

interface ScriptAssetRow {
  id: string;
  script_id: string;
  file_name: string;
  stored_name: string;
  mime_type: string;
  file_path: string;
  bytes: number;
  width: number | null;
  height: number | null;
  caption: string | null;
  keywords_json: string | null;
  metadata_source: string | null;
  created_at: string;
}

const MAX_ASSETS_PER_SCRIPT = 6;
const MAX_DECODED_BYTES = 3 * 1024 * 1024;

const EXT_BY_MIME: Record<ScriptAssetUpload['mimeType'], string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

function safeScriptId(scriptId: string): string {
  if (!/^[A-Za-z0-9-]+$/.test(scriptId)) {
    throw new AppError('INVALID_SCRIPT_ID', 'Invalid script id', 400);
  }
  return scriptId;
}

function sanitizeFileName(name: string): string {
  const base = path.basename(name).replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 100);
  return base || 'image';
}

function sniffMime(buffer: Buffer): ScriptAssetUpload['mimeType'] | null {
  if (
    buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
  ) return 'image/png';

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP'
  ) return 'image/webp';

  return null;
}

function decodeUpload(upload: ScriptAssetUpload): Buffer {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/.exec(upload.dataUrl);
  if (!match || match[1] !== upload.mimeType) {
    throw new AppError('INVALID_ASSET', `${upload.name}: invalid image data URL`, 400);
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(match[2] ?? '', 'base64');
  } catch {
    throw new AppError('INVALID_ASSET', `${upload.name}: invalid base64 image`, 400);
  }

  if (buffer.length === 0 || buffer.length > MAX_DECODED_BYTES) {
    throw new AppError(
      'INVALID_ASSET',
      `${upload.name}: image must be smaller than ${Math.round(MAX_DECODED_BYTES / 1024 / 1024)} MB`,
      400,
    );
  }

  const actual = sniffMime(buffer);
  if (!actual || actual !== upload.mimeType) {
    throw new AppError('INVALID_ASSET', `${upload.name}: unsupported or mismatched image format`, 400);
  }

  return buffer;
}

function parseKeywords(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}

function rowToScriptAsset(row: ScriptAssetRow): ScriptAsset {
  return {
    id: row.id,
    scriptId: row.script_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    caption: row.caption,
    keywords: parseKeywords(row.keywords_json),
    previewUrl: `/api/scripts/assets/${encodeURIComponent(row.id)}/preview`,
    createdAt: row.created_at,
  };
}

class UserAssetService {
  private rows(scriptId: string): ScriptAssetRow[] {
    return getDb()
      .prepare('SELECT * FROM script_assets WHERE script_id = ? ORDER BY created_at ASC')
      .all(safeScriptId(scriptId)) as ScriptAssetRow[];
  }

  list(scriptId: string): ScriptAsset[] {
    return this.rows(scriptId).map(rowToScriptAsset);
  }

  /**
   * Validate and store compressed images. No model call happens here: uploads
   * stay responsive, and image identification runs when the video is planned.
   */
  upload(scriptId: string, uploads: ScriptAssetUpload[]): ScriptAsset[] {
    const safeId = safeScriptId(scriptId);
    const existing = this.rows(safeId);
    if (existing.length + uploads.length > MAX_ASSETS_PER_SCRIPT) {
      throw new AppError(
        'TOO_MANY_ASSETS',
        `You can attach up to ${MAX_ASSETS_PER_SCRIPT} images to a script.`,
        400,
      );
    }

    const dir = path.join(config.storage.userAssetsDir, safeId);
    fs.mkdirSync(dir, { recursive: true });

    const insert = getDb().prepare(`
      INSERT INTO script_assets (
        id, script_id, file_name, stored_name, mime_type, file_path, bytes,
        width, height, caption, keywords_json, metadata_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const upload of uploads) {
      const cleanName = sanitizeFileName(upload.name);
      const buffer = decodeUpload(upload);
      const id = uuidv4();
      const ext = EXT_BY_MIME[upload.mimeType];
      const storedName = `${id}${ext}`;
      const filePath = path.join(dir, storedName);
      fs.writeFileSync(filePath, buffer, { mode: 0o600 });

      // Initial metadata is intentionally cheap; the vision pass is asynchronous
      // and runs once at storyboard time.
      const initial = fallbackMetadata(cleanName, upload.label);
      const keywords = [...new Set(
        (initial.keywords.length > 0 ? initial.keywords : [cleanName])
          .map((word) => word.trim())
          .filter((word) => word.length > 1),
      )].slice(0, 12);

      insert.run(
        id,
        safeId,
        cleanName,
        storedName,
        upload.mimeType,
        filePath,
        buffer.length,
        upload.width ?? null,
        upload.height ?? null,
        initial.caption || null,
        JSON.stringify(keywords),
        'filename',
      );
    }

    return this.list(safeId);
  }

  findFile(assetId: string): { filePath: string; mimeType: string; fileName: string } | null {
    const row = getDb()
      .prepare('SELECT * FROM script_assets WHERE id = ?')
      .get(assetId) as ScriptAssetRow | undefined;
    if (!row || !fs.existsSync(row.file_path)) return null;
    return { filePath: row.file_path, mimeType: row.mime_type, fileName: row.file_name };
  }

  remove(scriptId: string, assetId: string): void {
    const row = getDb()
      .prepare('SELECT * FROM script_assets WHERE id = ? AND script_id = ?')
      .get(assetId, safeScriptId(scriptId)) as ScriptAssetRow | undefined;
    if (!row) throw new AppError('ASSET_NOT_FOUND', 'Uploaded image not found', 404);
    try {
      fs.unlinkSync(row.file_path);
    } catch {
      // Deleting the row is still correct if the file was already removed.
    }
    getDb().prepare('DELETE FROM script_assets WHERE id = ?').run(assetId);
  }

  /**
   * Load uploads for one render job and, when configured, run the optional
   * vision model once per new file. The data URL is what the renderer receives;
   * no network is needed during Remotion.
   */
  async loadForJob(scriptId: string): Promise<UserAsset[]> {
    const rows = this.rows(scriptId);
    if (rows.length === 0) return [];

    const db = getDb();
    const update = db.prepare(`
      UPDATE script_assets
      SET caption = ?, keywords_json = ?, metadata_source = ?
      WHERE id = ?
    `);
    const assets: UserAsset[] = [];

    for (const row of rows) {
      let caption = row.caption ?? row.file_name;
      let keywords = parseKeywords(row.keywords_json);
      if (row.metadata_source !== 'vision') {
        const metadata: ImageMetadata = await visionService.identify(
          row.file_path,
          row.file_name,
        );
        caption = metadata.caption || caption;
        keywords = metadata.keywords.length > 0 ? metadata.keywords : keywords;
        update.run(caption, JSON.stringify(keywords), metadata.source, row.id);
      }

      let dataUrl: string;
      try {
        const body = fs.readFileSync(row.file_path).toString('base64');
        dataUrl = `data:${row.mime_type};base64,${body}`;
      } catch (err) {
        console.warn(
          `[UserAssets] Skipping ${row.file_name}: ` +
            (err instanceof Error ? err.message : String(err)),
        );
        continue;
      }

      assets.push({
        id: row.id,
        fileName: row.file_name,
        mimeType: row.mime_type,
        caption,
        keywords,
        dataUrl,
        assetPath: `user/${row.id}`,
      });
    }

    return assets;
  }
}

export const userAssetService = new UserAssetService();
