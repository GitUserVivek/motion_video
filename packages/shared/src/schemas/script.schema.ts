import { z } from 'zod';

export const ScriptModeSchema = z.enum(['topic', 'own-script']);
export const ScriptStatusSchema = z.enum(['draft', 'approved', 'rejected']);

export const GenerateScriptRequestSchema = z.object({
  topic: z.string().min(3).max(500),
  config: z.object({
    duration: z.number().int().min(10).max(300).optional(),
    language: z.string().min(2).max(10).optional(),
  }).optional(),
});

export const OwnScriptRequestSchema = z.object({
  content: z.string().min(10).max(10000),
  mode: z.enum(['preserve', 'improve']),
  config: z.object({
    duration: z.number().int().min(10).max(300).optional(),
    language: z.string().min(2).max(10).optional(),
  }).optional(),
});

export const ScriptResponseSchema = z.object({
  scriptId: z.string().uuid(),
  content: z.string().min(1),
  wordCount: z.number().int().nonnegative(),
  estimatedDurationSeconds: z.number().positive(),
});

export const ApproveScriptRequestSchema = z.object({
  scriptId: z.string().uuid(),
  content: z.string().min(10),
});

const ScriptAssetMimeSchema = z.enum(['image/png', 'image/jpeg', 'image/webp']);

export const ScriptAssetUploadSchema = z.object({
  name: z.string().min(1).max(160),
  mimeType: ScriptAssetMimeSchema,
  // The browser compresses to <1 MB; this upper bound rejects oversized JSON
  // before it reaches the image parser.
  dataUrl: z.string().min(32).max(4_500_000),
  label: z.string().trim().max(240).optional(),
  width: z.number().int().positive().max(20_000).optional(),
  height: z.number().int().positive().max(20_000).optional(),
});

export const UploadScriptAssetsRequestSchema = z.object({
  assets: z.array(ScriptAssetUploadSchema).min(1).max(6),
});
