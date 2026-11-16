import { Router } from 'express';
import { llmService } from '../services/llm.service.js';
import { ttsService } from '../services/tts.service.js';
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
  const [ffmpegOk, ttsOk] = await Promise.all([
    checkFfmpeg(),
    ttsService.isAvailable(),
  ]);

  const dbOk = checkDatabase();
  // Model check is synchronous — just stat the file
  const modelOk = llmService.isModelAvailable();

  const services = {
    database: dbOk,
    llm: modelOk,         // local GGUF model present on disk
    tts: ttsOk,
    ffmpeg: ffmpegOk,
    renderer: true,
  };

  const allOk = dbOk && modelOk && ffmpegOk;
  const status: HealthStatus['status'] = allOk ? 'ok' : !dbOk ? 'down' : 'degraded';

  const health: HealthStatus = {
    status,
    services: {
      ...services,
      // HealthStatus type still has `ollama` key — map llm → ollama for
      // backwards compat with the shared type until it's updated
      ollama: modelOk,
    },
    version: '1.0.0',
    uptime: Math.round((Date.now() - startTime) / 1000),
  };

  const response: ApiResponse<HealthStatus> = { success: true, data: health };
  res.status(status === 'down' ? 503 : 200).json(response);
});

export default router;
