import { Router } from 'express';
import { getDb } from '../db/db.js';
import type { Settings, ApiResponse } from '@edumotion/shared';
import { config } from '../config.js';

const router = Router();

router.get('/', (_req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const settings: Settings = {
    ollamaBaseUrl: config.ollama.baseUrl,
    ollamaModel: map['ollama_model'] ?? config.ollama.model,
    ttsEngine: (map['tts_engine'] ?? 'edge-tts') as Settings['ttsEngine'],
    ttsVoice: map['tts_voice'] ?? 'en-US-AriaNeural',
    outputDir: config.storage.outputDir,
    maxConcurrentJobs: parseInt(map['max_concurrent_jobs'] ?? '1', 10),
    defaultDuration: parseInt(map['default_duration'] ?? '40', 10),
    defaultAspectRatio: (map['default_aspect_ratio'] ?? '9:16') as Settings['defaultAspectRatio'],
  };

  const response: ApiResponse<Settings> = { success: true, data: settings };
  res.json(response);
});

router.patch('/', (req, res) => {
  const db = getDb();
  const updates = req.body as Record<string, string>;
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const updateAll = db.transaction((entries: [string, string][]) => {
    for (const [k, v] of entries) {
      upsert.run(k, v);
    }
  });
  updateAll(Object.entries(updates).map(([k, v]) => [k, String(v)] as [string, string]));
  res.json({ success: true });
});

export default router;
