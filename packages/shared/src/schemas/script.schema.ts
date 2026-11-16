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
