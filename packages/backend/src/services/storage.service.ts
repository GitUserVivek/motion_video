import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/db.js';
import { config } from '../config.js';
import type { VideoListItem } from '@edumotion/shared';

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

class StorageService {
  /**
   * Copy a rendered video to the permanent output directory.
   * Never overwrites: uses <jobId>-<timestamp>.mp4 naming.
   */
  async saveVideo(
    jobId: string,
    sourcePath: string,
    thumbnailPath: string | null,
    durationSec: number,
  ): Promise<string> {
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Source video not found: ${sourcePath}`);
    }

    const fileName = `${jobId}-${Date.now()}.mp4`;
    const destPath = path.join(config.storage.videosDir, fileName);

    // Ensure destination directory exists
    fs.mkdirSync(config.storage.videosDir, { recursive: true });

    // Guard against overwrite
    if (fs.existsSync(destPath)) {
      throw new Error(`Destination already exists: ${destPath}`);
    }

    fs.copyFileSync(sourcePath, destPath);
    const stat = fs.statSync(destPath);

    const db = getDb();
    const videoId = `vid-${uuidv4()}`;

    db.prepare(`
      INSERT INTO videos (id, job_id, file_path, duration_sec, size_bytes, thumbnail_path)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(videoId, jobId, destPath, durationSec, stat.size, thumbnailPath);

    return videoId;
  }

  getVideoPath(videoId: string): string | null {
    const db = getDb();
    const row = db
      .prepare('SELECT file_path FROM videos WHERE id = ?')
      .get(videoId) as { file_path: string } | undefined;
    return row?.file_path ?? null;
  }

  generateDownloadUrl(videoId: string): string {
    return `/api/videos/${videoId}/download`;
  }

  deleteVideo(videoId: string): void {
    const db = getDb();
    const row = db
      .prepare('SELECT file_path, thumbnail_path FROM videos WHERE id = ?')
      .get(videoId) as { file_path: string; thumbnail_path: string | null } | undefined;

    if (!row) throw new Error(`Video not found: ${videoId}`);

    if (fs.existsSync(row.file_path)) fs.unlinkSync(row.file_path);
    if (row.thumbnail_path && fs.existsSync(row.thumbnail_path)) {
      fs.unlinkSync(row.thumbnail_path);
    }

    db.prepare('DELETE FROM videos WHERE id = ?').run(videoId);
  }

  listVideos(limit = 50, offset = 0): VideoListItem[] {
    const db = getDb();
    const rows = db.prepare(`
      SELECT v.*, p.title
      FROM videos v
      JOIN jobs j ON j.id = v.job_id
      JOIN projects p ON p.id = j.project_id
      ORDER BY v.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as VideoRow[];

    return rows.map((r) => ({
      id: r.id,
      jobId: r.job_id,
      title: r.title,
      durationSeconds: r.duration_sec,
      sizeBytes: r.size_bytes,
      createdAt: r.created_at,
      downloadUrl: this.generateDownloadUrl(r.id),
      thumbnailUrl: r.thumbnail_path ? `/api/videos/${r.id}/thumbnail` : null,
    }));
  }

  videoExists(videoId: string): boolean {
    const filePath = this.getVideoPath(videoId);
    return filePath !== null && fs.existsSync(filePath);
  }

  /**
   * Clean up any orphaned video records where the file no longer exists on disk.
   */
  pruneOrphans(): number {
    const db = getDb();
    const rows = db.prepare('SELECT id, file_path FROM videos').all() as Array<{ id: string; file_path: string }>;
    let pruned = 0;
    for (const row of rows) {
      if (!fs.existsSync(row.file_path)) {
        db.prepare('DELETE FROM videos WHERE id = ?').run(row.id);
        pruned++;
      }
    }
    return pruned;
  }
}

export const storageService = new StorageService();
