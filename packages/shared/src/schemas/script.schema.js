"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApproveScriptRequestSchema = exports.ScriptResponseSchema = exports.OwnScriptRequestSchema = exports.GenerateScriptRequestSchema = exports.ScriptStatusSchema = exports.ScriptModeSchema = void 0;
const zod_1 = require("zod");
exports.ScriptModeSchema = zod_1.z.enum(['topic', 'own-script']);
exports.ScriptStatusSchema = zod_1.z.enum(['draft', 'approved', 'rejected']);
exports.GenerateScriptRequestSchema = zod_1.z.object({
    topic: zod_1.z.string().min(3).max(500),
    config: zod_1.z.object({
        duration: zod_1.z.number().int().min(10).max(300).optional(),
        language: zod_1.z.string().min(2).max(10).optional(),
    }).optional(),
});
exports.OwnScriptRequestSchema = zod_1.z.object({
    content: zod_1.z.string().min(10).max(10000),
    mode: zod_1.z.enum(['preserve', 'improve']),
    config: zod_1.z.object({
        duration: zod_1.z.number().int().min(10).max(300).optional(),
        language: zod_1.z.string().min(2).max(10).optional(),
    }).optional(),
});
exports.ScriptResponseSchema = zod_1.z.object({
    scriptId: zod_1.z.string().uuid(),
    content: zod_1.z.string().min(1),
    wordCount: zod_1.z.number().int().nonnegative(),
    estimatedDurationSeconds: zod_1.z.number().positive(),
});
exports.ApproveScriptRequestSchema = zod_1.z.object({
    scriptId: zod_1.z.string().uuid(),
    content: zod_1.z.string().min(10),
});
