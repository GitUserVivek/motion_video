import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { llmService } from '../services/llm.service.js';
import { ttsService } from '../services/tts.service.js';
import { config } from '../config.js';
import type { HealthStatus, ApiResponse } from '@edumotion/shared';

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
    const dbDir = path.join(config.storage.dataDir, 'db');
    fs.mkdirSync(dbDir, { recursive: true });
    // Write a tiny probe file and delete it
    const probe = path.join(dbDir, '.health');
    fs.writeFileSync(probe, '1');
    fs.unlinkSync(probe);
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
  const modelOk = llmService.isModelAvailable();

  const services = {
    database: dbOk,
    llm: modelOk,
    tts: ttsOk,
    ffmpeg: ffmpegOk,
    renderer: true,
    ollama: modelOk, // backwards compat alias
  };

  const allOk = dbOk && modelOk && ffmpegOk;
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
