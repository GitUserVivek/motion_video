import { Router } from 'express';
import { getDb } from '../db/db.js';
import type {
  JobResponse,
  JobAssetsResponse,
  ApiResponse,
  SceneAssetUsage,
} from '@edumotion/shared';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

interface JobRow {
  id: string;
  project_id: string;
  status: string;
  progress: number;
  current_step: string;
  error: string | null;
  created_at: string;
  updated_at: string;
  retry_count: number;
  video_id: string | null;
  scenes_completed?: number;
  scenes_total?: number;
  assets_json?: string | null;
}

function parseAssetUses(raw: string | null | undefined): SceneAssetUsage[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SceneAssetUsage[]) : undefined;
  } catch {
    // A corrupt report must not break job polling.
    return undefined;
  }
}

/**
 * Attach the URL the UI previews each file from. Only real files get one: a
 * built-in glyph lives inside the renderer and has no image to fetch.
 */
function withPreviewUrls(assets: SceneAssetUsage[] | undefined): SceneAssetUsage[] {
  if (!assets) return [];
  return assets.map((use) => {
    if (!use.asset || use.source === 'builtin') return use;
    const encoded = use.asset
      .split('/')
      .filter((segment) => segment.length > 0)
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return { ...use, previewUrl: `/api/assets/${encoded}` };
  });
}

function rowToResponse(row: JobRow): JobResponse {
  return {
    jobId: row.id,
    status: row.status as JobResponse['status'],
    progress: row.progress,
    currentStep: row.current_step,
    error: row.error,
    videoId: row.video_id ?? undefined,
    scenesCompleted: typeof row.scenes_completed === 'number' ? row.scenes_completed : undefined,
    scenesTotal: typeof row.scenes_total === 'number' ? row.scenes_total : undefined,
    // The report itself is deliberately not part of the polled payload: it can
    // carry hundreds of URLs and only ever changes once per job.
    assetsAvailable: typeof row.assets_json === 'string' && row.assets_json.trim().length > 2,
  };
}

router.get('/:jobId/assets', (req, res) => {
  const db = getDb();
  const row = db
    .prepare('SELECT id, assets_json FROM jobs WHERE id = ?')
    .get(req.params['jobId']) as { id: string; assets_json: string | null } | undefined;

  if (!row) throw new AppError('JOB_NOT_FOUND', 'Job not found', 404);

  const response: ApiResponse<JobAssetsResponse> = {
    success: true,
    data: { assets: withPreviewUrls(parseAssetUses(row.assets_json)) },
  };
  res.json(response);
});

router.get('/', (_req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT j.*, v.id as video_id
    FROM jobs j
    LEFT JOIN videos v ON v.job_id = j.id
    ORDER BY j.created_at DESC
    LIMIT 50
  `).all() as JobRow[];

  const response: ApiResponse<JobResponse[]> = {
    success: true,
    data: rows.map(rowToResponse),
  };
  res.json(response);
});

router.get('/:jobId', (req, res) => {
  const db = getDb();
  const row = db.prepare(`
    SELECT j.*, v.id as video_id
    FROM jobs j
    LEFT JOIN videos v ON v.job_id = j.id
    WHERE j.id = ?
  `).get(req.params['jobId']) as JobRow | undefined;

  if (!row) throw new AppError('JOB_NOT_FOUND', 'Job not found', 404);

  const response: ApiResponse<JobResponse> = { success: true, data: rowToResponse(row) };
  res.json(response);
});

router.post('/:jobId/cancel', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT id, status FROM jobs WHERE id = ?').get(req.params['jobId']) as
    | { id: string; status: string }
    | undefined;

  if (!row) throw new AppError('JOB_NOT_FOUND', 'Job not found', 404);
  if (!['pending', 'processing'].includes(row.status)) {
    throw new AppError('CANNOT_CANCEL', `Cannot cancel job with status: ${row.status}`, 400);
  }

  db.prepare(`
    UPDATE jobs SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?
  `).run(req.params['jobId']);

  res.json({ success: true });
});

export default router;
