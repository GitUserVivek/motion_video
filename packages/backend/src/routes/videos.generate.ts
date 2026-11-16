import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/db.js';
import { GenerateVideoRequestSchema } from '@edumotion/shared';
import { AppError } from '../middleware/errorHandler.js';
import type { JobResponse, ApiResponse } from '@edumotion/shared';

const router = Router();

router.post('/generate', async (req, res) => {
  const parsed = GenerateVideoRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Invalid video config', 400, parsed.error.errors);
  }

  const { scriptId, config } = parsed.data;

  const db = getDb();
  const script = db.prepare('SELECT * FROM scripts WHERE id = ? AND status = \'approved\'').get(scriptId) as
    | { id: string; project_id: string; content: string }
    | undefined;

  if (!script) {
    throw new AppError('SCRIPT_NOT_FOUND', 'Approved script not found', 404);
  }

  const jobId = uuidv4();
  db.prepare(`
    INSERT INTO jobs (id, project_id, script_id, config_json)
    VALUES (?, ?, ?, ?)
  `).run(jobId, script.project_id, scriptId, JSON.stringify(config));

  const response: ApiResponse<JobResponse> = {
    success: true,
    data: {
      jobId,
      status: 'pending',
      progress: 0,
      currentStep: 'pending',
      error: null,
    },
  };
  res.status(202).json(response);
});

export default router;
