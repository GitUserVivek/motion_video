import { z } from 'zod';

export const JobStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']);

export const JobSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  status: JobStatusSchema,
  progress: z.number().min(0).max(100),
  currentStep: z.string(),
  error: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  retryCount: z.number().int().min(0).max(3),
});

export const VideoConfigSchema = z.object({
  duration: z.number().int().min(10).max(300),
  aspectRatio: z.enum(['9:16', '16:9', '1:1']),
  language: z.string().min(2).max(10),
  voice: z.string().min(1),
  animationTheme: z.enum(['modern', 'playful', 'minimal', 'educational']),
  subtitles: z.boolean(),
  backgroundMusic: z.boolean(),
  fps: z.number().int().min(24).max(60),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const GenerateVideoRequestSchema = z.object({
  scriptId: z.string().uuid(),
  config: VideoConfigSchema,
});
