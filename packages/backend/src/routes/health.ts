import { Router } from 'express';
import { ollamaService } from '../services/ollama.service.js';
import { getDb } from '../db/db.js';
import type { HealthStatus, ApiResponse } from '@edumotion/shared';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const router = Router();
const startTime = Date.now();

async function checkFfmpeg(): Promise<boolean> {
  try {
    await execAsync('ffmpeg -version');
    return true;
  } catch {
    return false;
  }
}

function checkDatabase(): boolean {
  try {
    const db = getDb();
    db.prepare('SELECT 1').get();
    return true;
  } catch {
    return false;
  }
}

router.get('/', async (_req, res) => {
  const [ollamaOk, ffmpegOk] = await Promise.all([
    ollamaService.isAvailable(),
    checkFfmpeg(),
  ]);

  const dbOk = checkDatabase();

  const services = {
    database: dbOk,
    ollama: ollamaOk,
    tts: false, // updated in Phase 5
    ffmpeg: ffmpegOk,
    renderer: true, // renderer package always available
  };

  const allOk = dbOk && ollamaOk && ffmpegOk;
  const status: HealthStatus['status'] = allOk ? 'ok' : !dbOk ? 'down' : 'degraded';

  const health: HealthStatus = {
    status,
    services,
    version: '1.0.0',
    uptime: Math.round((Date.now() - startTime) / 1000),
  };

  const response: ApiResponse<HealthStatus> = { success: true, data: health };
  res.status(status === 'down' ? 503 : 200).json(response);
});

export default router;
