"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenerateVideoRequestSchema = exports.VideoConfigSchema = exports.JobSchema = exports.JobStatusSchema = void 0;
const zod_1 = require("zod");
exports.JobStatusSchema = zod_1.z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']);
exports.JobSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    projectId: zod_1.z.string().uuid(),
    status: exports.JobStatusSchema,
    progress: zod_1.z.number().min(0).max(100),
    currentStep: zod_1.z.string(),
    error: zod_1.z.string().nullable(),
    createdAt: zod_1.z.string().datetime(),
    updatedAt: zod_1.z.string().datetime(),
    retryCount: zod_1.z.number().int().min(0).max(3),
});
exports.VideoConfigSchema = zod_1.z.object({
    duration: zod_1.z.number().int().min(10).max(300),
    aspectRatio: zod_1.z.enum(['9:16', '16:9', '1:1']),
    language: zod_1.z.string().min(2).max(10),
    voice: zod_1.z.string().min(1),
    animationTheme: zod_1.z.enum(['modern', 'playful', 'minimal', 'educational']),
    subtitles: zod_1.z.boolean(),
    backgroundMusic: zod_1.z.boolean(),
    fps: zod_1.z.number().int().min(24).max(60),
    width: zod_1.z.number().int().positive(),
    height: zod_1.z.number().int().positive(),
});
exports.GenerateVideoRequestSchema = zod_1.z.object({
    scriptId: zod_1.z.string().uuid(),
    config: exports.VideoConfigSchema,
});
