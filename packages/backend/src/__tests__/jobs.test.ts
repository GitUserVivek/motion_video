import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jobsRouter from '../routes/jobs.js';
import { errorHandler } from '../middleware/errorHandler.js';

const mockJob = {
  id: 'job-abc',
  project_id: 'proj-1',
  status: 'pending',
  progress: 0,
  current_step: 'pending',
  error: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  retry_count: 0,
  video_id: null,
};

const mockDb = {
  prepare: vi.fn().mockReturnValue({
    get: vi.fn().mockReturnValue(mockJob),
    all: vi.fn().mockReturnValue([mockJob]),
    run: vi.fn(),
  }),
};

vi.mock('../db/db.js', () => ({ getDb: vi.fn(() => mockDb) }));

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/jobs', jobsRouter);
  app.use(errorHandler);
  return app;
}

describe('GET /api/jobs', () => {
  it('returns job list', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/jobs');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('GET /api/jobs/:jobId', () => {
  it('returns single job', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/jobs/job-abc');
    expect(res.status).toBe(200);
    expect(res.body.data.jobId).toBe('job-abc');
  });

  it('returns 404 for unknown job', async () => {
    const app = buildApp();
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn().mockReturnValue(undefined), all: vi.fn(), run: vi.fn() });
    const res = await request(app).get('/api/jobs/not-found');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/jobs/:jobId/cancel', () => {
  it('cancels a pending job', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/jobs/job-abc/cancel');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
