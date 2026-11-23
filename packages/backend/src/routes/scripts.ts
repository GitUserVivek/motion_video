import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/db.js';
import {
  GenerateScriptRequestSchema,
  OwnScriptRequestSchema,
  UploadScriptAssetsRequestSchema,
} from '@edumotion/shared';
import fs from 'fs';
import { scriptService } from '../services/script.service.js';
import { userAssetService } from '../services/user.asset.service.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import type { ScriptResponse, ApiResponse } from '@edumotion/shared';
import { WORDS_PER_SECOND } from '@edumotion/shared';

const router = Router();

// POST /api/scripts/generate  — topic mode
router.post('/generate', asyncHandler(async (req, res) => {
  const parsed = GenerateScriptRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Invalid request', 400, parsed.error.errors);
  }

  const { topic, config: videoConfig } = parsed.data;

  // Create project
  const db = getDb();
  const projectId = uuidv4();
  db.prepare('INSERT INTO projects (id, title) VALUES (?, ?)').run(projectId, topic.slice(0, 100));

  const content = await scriptService.generateFromTopic(topic, videoConfig);
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const estimatedDuration = wordCount / WORDS_PER_SECOND;

  const scriptId = uuidv4();
  db.prepare(`
    INSERT INTO scripts (id, project_id, mode, content, word_count, estimated_duration_sec, original_topic)
    VALUES (?, ?, 'topic', ?, ?, ?, ?)
  `).run(scriptId, projectId, content, wordCount, estimatedDuration, topic);

  const response: ApiResponse<ScriptResponse> = {
    success: true,
    data: { scriptId, content, wordCount, estimatedDurationSeconds: estimatedDuration },
  };
  res.status(201).json(response);
}));

// POST /api/scripts/validate  — own-script mode
router.post('/validate', asyncHandler(async (req, res) => {
  const parsed = OwnScriptRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Invalid request', 400, parsed.error.errors);
  }

  const { content, mode, config: videoConfig } = parsed.data;

  const processedContent = mode === 'improve'
    ? await scriptService.rewriteScript(content, 'improve')
    : await scriptService.validateScript(content);

  const db = getDb();
  const projectId = uuidv4();
  const title = content.slice(0, 60) + (content.length > 60 ? '...' : '');
  db.prepare('INSERT INTO projects (id, title) VALUES (?, ?)').run(projectId, title);

  const wordCount = processedContent.split(/\s+/).filter(Boolean).length;
  const estimatedDuration = wordCount / WORDS_PER_SECOND;

  const scriptId = uuidv4();
  db.prepare(`
    INSERT INTO scripts (id, project_id, mode, content, word_count, estimated_duration_sec)
    VALUES (?, ?, 'own-script', ?, ?, ?)
  `).run(scriptId, projectId, processedContent, wordCount, estimatedDuration);

  const response: ApiResponse<ScriptResponse> = {
    success: true,
    data: {
      scriptId,
      content: processedContent,
      wordCount,
      estimatedDurationSeconds: estimatedDuration,
    },
  };
  res.status(201).json(response);
}));

// POST /api/scripts/rewrite
router.post('/rewrite', asyncHandler(async (req, res) => {
  const body = req.body as { scriptId?: string; mode?: string };
  if (!body.scriptId || !body.mode) {
    throw new AppError('VALIDATION_ERROR', 'scriptId and mode required', 400);
  }

  const db = getDb();
  const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(body.scriptId) as
    | { id: string; content: string }
    | undefined;
  if (!script) throw new AppError('SCRIPT_NOT_FOUND', 'Script not found', 404);

  const newContent = await scriptService.rewriteScript(
    script.content,
    body.mode as 'improve' | 'preserve',
  );

  const wordCount = newContent.split(/\s+/).filter(Boolean).length;
  const estimatedDuration = wordCount / WORDS_PER_SECOND;

  db.prepare(`
    UPDATE scripts SET content = ?, word_count = ?, estimated_duration_sec = ? WHERE id = ?
  `).run(newContent, wordCount, estimatedDuration, body.scriptId);

  const response: ApiResponse<ScriptResponse> = {
    success: true,
    data: {
      scriptId: script.id,
      content: newContent,
      wordCount,
      estimatedDurationSeconds: estimatedDuration,
    },
  };
  res.json(response);
}));

// GET /api/scripts/assets/:assetId/preview — thumbnail for Review Script.
router.get('/assets/:assetId/preview', (req, res) => {
  const asset = userAssetService.findFile(req.params['assetId'] ?? '');
  if (!asset) throw new AppError('ASSET_NOT_FOUND', 'Uploaded image not found', 404);

  try {
    res.set({
      'Content-Type': asset.mimeType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
    });
    res.send(fs.readFileSync(asset.filePath));
  } catch {
    throw new AppError('ASSET_NOT_FOUND', 'Uploaded image not found', 404);
  }
});

// GET /api/scripts/:scriptId/assets — optional images attached before approval.
router.get('/:scriptId/assets', (req, res) => {
  const scriptId = req.params['scriptId'] ?? '';
  const db = getDb();
  const script = db.prepare('SELECT id FROM scripts WHERE id = ?').get(scriptId);
  if (!script) throw new AppError('SCRIPT_NOT_FOUND', 'Script not found', 404);
  res.json({ success: true, data: { assets: userAssetService.list(scriptId) } });
});

// POST /api/scripts/:scriptId/assets — accept compressed PNG/JPEG/WebP files.
router.post('/:scriptId/assets', (req, res) => {
  const scriptId = req.params['scriptId'] ?? '';
  const db = getDb();
  const script = db.prepare('SELECT id FROM scripts WHERE id = ?').get(scriptId);
  if (!script) throw new AppError('SCRIPT_NOT_FOUND', 'Script not found', 404);

  const parsed = UploadScriptAssetsRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Invalid image upload', 400, parsed.error.errors);
  }

  const assets = userAssetService.upload(scriptId, parsed.data.assets);
  res.status(201).json({ success: true, data: { assets } });
});

// DELETE /api/scripts/:scriptId/assets/:assetId
router.delete('/:scriptId/assets/:assetId', (req, res) => {
  userAssetService.remove(req.params['scriptId'] ?? '', req.params['assetId'] ?? '');
  res.json({ success: true });
});

// POST /api/scripts/approve
router.post('/approve', (req, res) => {
  const body = req.body as { scriptId?: string; content?: string };
  if (!body.scriptId) throw new AppError('VALIDATION_ERROR', 'scriptId required', 400);

  const db = getDb();
  const script = db.prepare('SELECT id FROM scripts WHERE id = ?').get(body.scriptId);
  if (!script) throw new AppError('SCRIPT_NOT_FOUND', 'Script not found', 404);

  const content = body.content;
  if (content) {
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const estimatedDuration = wordCount / 2.5;
    db.prepare(`
      UPDATE scripts SET content = ?, status = 'approved', word_count = ?, estimated_duration_sec = ? WHERE id = ?
    `).run(content, wordCount, estimatedDuration, body.scriptId);
  } else {
    db.prepare(`UPDATE scripts SET status = 'approved' WHERE id = ?`).run(body.scriptId);
  }

  res.json({ success: true });
});

export default router;
