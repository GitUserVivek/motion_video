import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { runMigrations } from './db/migrations.js';
import { llmService } from './services/llm.service.js';
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
    config.storage.resourcesDir,
    config.storage.dataDir,
    path.join(config.storage.assetsDir, 'characters'),
    path.join(config.storage.assetsDir, 'backgrounds'),
    path.join(config.storage.assetsDir, 'animations'),
    path.join(config.storage.assetsDir, 'sounds'),
    path.join(config.storage.resourcesDir, 'icons'),
    path.join(config.storage.resourcesDir, 'images'),
    path.join(config.storage.rootDir, 'data', 'projects'),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Print which commit and which build of the code is actually running, so a stale
 * `dist/` or an un-pulled change is visible in the log instead of being guessed.
 */
function logBuildInfo(): void {
  const distPath = fileURLToPath(import.meta.url);
  const builtAt = fs.statSync(distPath).mtime;

  let commit = 'unknown (no git metadata)';
  let commitTime = 0;
  try {
    const out = execFileSync('git', ['log', '-1', '--pretty=%h%n%s%n%ct'], {
      cwd: config.storage.rootDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const [hash, subject, timestamp] = out.split('\n');
    commit = `${hash ?? ''} ${subject ?? ''}`.trim();
    commitTime = Number(timestamp) * 1000 || 0;
  } catch {
    // git or .git is not available (e.g. sources copied without history).
  }

  console.log(`[Server] Code:  ${commit}`);
  console.log(`[Server] Built: ${builtAt.toISOString()}`);
  if (commitTime > 0 && builtAt.getTime() + 1000 < commitTime) {
    console.warn(
      '[Server] WARNING: built code is older than the latest commit — run ./start.sh to rebuild',
    );
  }
}

async function bootstrap(): Promise<void> {
  logBuildInfo();
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

  const server = app.listen(config.port, () => {
    console.log(`[Server] EduMotion backend running on http://localhost:${config.port}`);
    console.log(`[Server] Environment: ${config.nodeEnv}`);
    console.log(`[Server] DB: ${config.storage.dataDir}/db/ (JSON store)`);
    console.log(`[Server] Model: ${config.localLlm.modelName} (${config.localLlm.modelsDir})`);
    console.log(`[Server] RAM: ${config.system.totalRamGB}GB | CPUs: ${config.system.cpuCount}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Fatal] Port ${config.port} is already in use.`);
      console.error(`        Run: fuser -k ${config.port}/tcp && node packages/backend/dist/index.js`);
    } else {
      console.error('[Fatal] Server error:', err.message);
    }
    process.exit(1);
  });

  // Start render worker in background
  // Worker imported lazily to avoid circular deps
  const { startRenderWorker } = await import('./workers/render.worker.js');
  startRenderWorker();

  // Warm the LLM in the background so the first script request does not spend
  // its whole lifetime loading the model (or running a one-time source build).
  if (llmService.isModelAvailable()) {
    void llmService.preload().catch((err: unknown) => {
      console.error(
        '[LLM] Preload failed — will retry on the first request:',
        err instanceof Error ? err.message : err,
      );
    });
  }
}

bootstrap().catch((err) => {
  console.error('[Fatal] Failed to start server:', err);
  process.exit(1);
});
