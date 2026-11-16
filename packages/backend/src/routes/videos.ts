import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { getDb } from '../db/db.js';
import type { VideoListItem, ApiResponse } from '@edumotion/shared';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

interface VideoRow {
  id: string;
  job_id: string;
  file_path: string;
  duration_sec: number;
  size_bytes: number;
  thumbnail_path: string | null;
  created_at: string;
  title: string;
}

router.get('/', (_req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT v.*, p.title
    FROM videos v
    JOIN jobs j ON j.id = v.job_id
    JOIN projects p ON p.id = j.project_id
    ORDER BY v.created_at DESC
  `).all() as VideoRow[];

  const items: VideoListItem[] = rows.map((r) => ({
    id: r.id,
    jobId: r.job_id,
    title: r.title,
    durationSeconds: r.duration_sec,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at,
    downloadUrl: `/api/videos/${r.id}/download`,
    thumbnailUrl: r.thumbnail_path ? `/api/videos/${r.id}/thumbnail` : null,
  }));

  const response: ApiResponse<VideoListItem[]> = { success: true, data: items };
  res.json(response);
});

router.get('/:videoId/download', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params['videoId']) as VideoRow | undefined;

  if (!row) throw new AppError('VIDEO_NOT_FOUND', 'Video not found', 404);

  if (!fs.existsSync(row.file_path)) {
    throw new AppError('FILE_MISSING', 'Video file not found on disk', 404);
  }

  const filename = path.basename(row.file_path);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Length', row.size_bytes);
  fs.createReadStream(row.file_path).pipe(res);
});

router.get('/:videoId/thumbnail', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT thumbnail_path FROM videos WHERE id = ?').get(req.params['videoId']) as
    | { thumbnail_path: string | null }
    | undefined;

  if (!row?.thumbnail_path || !fs.existsSync(row.thumbnail_path)) {
    throw new AppError('THUMBNAIL_NOT_FOUND', 'Thumbnail not found', 404);
  }

  res.setHeader('Content-Type', 'image/jpeg');
  fs.createReadStream(row.thumbnail_path).pipe(res);
});

router.delete('/:videoId', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params['videoId']) as VideoRow | undefined;

  if (!row) throw new AppError('VIDEO_NOT_FOUND', 'Video not found', 404);

  // Delete file from disk
  if (fs.existsSync(row.file_path)) {
    fs.unlinkSync(row.file_path);
  }
  if (row.thumbnail_path && fs.existsSync(row.thumbnail_path)) {
    fs.unlinkSync(row.thumbnail_path);
  }

  db.prepare('DELETE FROM videos WHERE id = ?').run(req.params['videoId']);
  res.json({ success: true });
});

export default router;
