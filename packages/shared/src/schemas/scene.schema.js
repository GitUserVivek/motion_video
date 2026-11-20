"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StoryboardPlanSchema = exports.SceneInstructionSchema = exports.SceneChildSchema = exports.SubtitleEntrySchema = exports.ComponentNameSchema = void 0;
const zod_1 = require("zod");
exports.ComponentNameSchema = zod_1.z.enum([
    'AnimatedText',
    'AnimatedNumber',
    'Character',
    'Teacher',
    'EducationalObject',
    'ObjectGroup',
    'ConceptDiagram',
    'MultiplicationTable',
    'ImageScene',
    'BackgroundScene',
    'Subtitle',
    'QuestionCard',
    'Confetti',
    'EndScreen',
    'ProgressBar',
]);
exports.SubtitleEntrySchema = zod_1.z.object({
    index: zod_1.z.number().int().nonnegative(),
    startMs: zod_1.z.number().nonnegative(),
    endMs: zod_1.z.number().nonnegative(),
    text: zod_1.z.string().min(1),
});
exports.SceneChildSchema = zod_1.z.object({
    component: exports.ComponentNameSchema,
    props: zod_1.z.record(zod_1.z.unknown()),
});
exports.SceneInstructionSchema = zod_1.z.object({
    id: zod_1.z.string().min(1),
    startFrame: zod_1.z.number().int().nonnegative(),
    endFrame: zod_1.z.number().int().positive(),
    component: exports.ComponentNameSchema,
    props: zod_1.z.record(zod_1.z.unknown()),
    children: zod_1.z.array(exports.SceneChildSchema).optional(),
}).refine((s) => s.endFrame > s.startFrame, {
    message: 'endFrame must be greater than startFrame',
});
exports.StoryboardPlanSchema = zod_1.z.object({
    jobId: zod_1.z.string().min(1),
    totalFrames: zod_1.z.number().int().positive(),
    fps: zod_1.z.number().int().positive(),
    audioDurationMs: zod_1.z.number().nonnegative(),
    scenes: zod_1.z.array(exports.SceneInstructionSchema).min(1),
});
