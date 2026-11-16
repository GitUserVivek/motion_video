import { Router } from 'express';
import { getDb } from '../db/db.js';
import type { JobResponse, ApiResponse } from '@edumotion/shared';
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
}

function rowToResponse(row: JobRow): JobResponse {
  return {
    jobId: row.id,
    status: row.status as JobResponse['status'],
    progress: row.progress,
    currentStep: row.current_step,
    error: row.error,
    videoId: row.video_id ?? undefined,
  };
}

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
