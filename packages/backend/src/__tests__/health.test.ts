import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import healthRouter from '../routes/health.js';
import { errorHandler } from '../middleware/errorHandler.js';

// Mock dependencies
vi.mock('../services/ollama.service.js', () => ({
  ollamaService: { isAvailable: vi.fn().mockResolvedValue(true) },
}));
vi.mock('../db/db.js', () => ({
  getDb: vi.fn(() => ({ prepare: () => ({ get: () => 1 }) })),
}));
vi.mock('child_process', () => ({
  exec: vi.fn((_cmd: string, cb: (err: null, stdout: string) => void) =>
    cb(null, 'ffmpeg version 6.0')
  ),
}));

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/health', healthRouter);
  app.use(errorHandler);
  return app;
}

describe('GET /api/health', () => {
  it('returns 200 with health data', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBeLessThanOrEqual(503);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('status');
    expect(res.body.data).toHaveProperty('services');
    expect(res.body.data).toHaveProperty('uptime');
  });
});
