import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { config } from './config.js';
import { runMigrations } from './db/migrations.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import healthRouter from './routes/health.js';
import scriptsRouter from './routes/scripts.js';
import videosRouter from './routes/videos.js';
import videosGenerateRouter from './routes/videos.generate.js';
import jobsRouter from './routes/jobs.js';
import settingsRouter from './routes/settings.js';

// Ensure required directories exist
function ensureDirectories(): void {
  const dirs = [
    config.storage.outputDir,
    config.storage.videosDir,
    config.storage.audioDir,
    config.storage.subtitlesDir,
    config.storage.thumbnailsDir,
    config.storage.tempDir,
    config.storage.assetsDir,
    config.storage.dataDir,
    path.join(config.storage.assetsDir, 'characters'),
    path.join(config.storage.assetsDir, 'backgrounds'),
    path.join(config.storage.assetsDir, 'animations'),
    path.join(config.storage.assetsDir, 'sounds'),
    path.join(config.storage.rootDir, 'data', 'projects'),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

async function bootstrap(): Promise<void> {
  ensureDirectories();
  runMigrations();

  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(requestLogger);

  // Routes
  app.use('/api/health', healthRouter);
  app.use('/api/scripts', scriptsRouter);
  app.use('/api/videos', videosGenerateRouter);
  app.use('/api/videos', videosRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/settings', settingsRouter);

  // Error handler (must be last)
  app.use(errorHandler);

  app.listen(config.port, () => {
    console.log(`[Server] EduMotion backend running on http://localhost:${config.port}`);
    console.log(`[Server] Environment: ${config.nodeEnv}`);
    console.log(`[Server] DB: ${config.storage.dataDir}/db/ (JSON store)`);
    console.log(`[Server] Model: ${config.localLlm.modelName} (${config.localLlm.modelsDir})`);
    console.log(`[Server] RAM: ${config.system.totalRamGB}GB | CPUs: ${config.system.cpuCount}`);
  });

  // Start render worker in background
  // Worker imported lazily to avoid circular deps
  const { startRenderWorker } = await import('./workers/render.worker.js');
  startRenderWorker();
}

bootstrap().catch((err) => {
  console.error('[Fatal] Failed to start server:', err);
  process.exit(1);
});
