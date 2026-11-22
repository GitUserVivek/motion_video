"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StoryboardValidationSchema = exports.SceneValidationSchema = exports.VisualRelevanceSchema = exports.StoryboardPlanSchema = exports.SceneInstructionSchema = exports.SceneChildSchema = exports.SubtitleEntrySchema = exports.EducationalObjectTypeSchema = exports.ComponentNameSchema = void 0;
const zod_1 = require("zod");
// Enhanced component names with new educational components
exports.ComponentNameSchema = zod_1.z.enum([
    // Existing components
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
    // New educational components
    'SplitScreenComparison',
    'ProcessFlow',
    'Timeline',
    'HighlightedRegion',
    'AnimatedDiagram',
    'NumberCounter',
    'KineticTypography',
    'ObjectZoom',
    'Callout',
    // Phase 6 composition set
    'SpeechBubble',
    'AnnotatedCallout',
    'ComparisonChart',
    'SummaryScene',
    // Every name above has a renderer in packages/renderer/src/components and an
    // entry in COMPONENT_MAP. Names without a renderer must not be in this union:
    // the model could request a component that throws at render time.
]);
// Enhanced educational object types
exports.EducationalObjectTypeSchema = zod_1.z.enum([
    'book', 'apple', 'globe', 'atom', 'lightbulb', 'calculator', 'pencil', 'star',
    'leaf', 'plant', 'sun', 'water', 'cloud', 'rocket', 'heart', 'cell', 'microscope',
    'brain', 'bone', 'skeleton', 'dna', 'neuron', 'circuit', 'server', 'network',
    'equation', 'chart', 'timeline', 'beaker', 'testtube', 'molecule', 'electron',
    'proton', 'neutron', 'bacteria', 'virus', 'organ', 'femur', 'skull', 'ribcage'
]);
// Enhanced subtitle entry with word-level timing
exports.SubtitleEntrySchema = zod_1.z.object({
    index: zod_1.z.number().int().nonnegative(),
    startMs: zod_1.z.number().nonnegative(),
    endMs: zod_1.z.number().nonnegative(),
    text: zod_1.z.string().min(1),
    // Optional word-level timing for better synchronization
    words: zod_1.z.array(zod_1.z.object({
        text: zod_1.z.string(),
        startMs: zod_1.z.number().nonnegative(),
        endMs: zod_1.z.number().nonnegative(),
    })).optional(),
});
// Enhanced scene child with validation for educational content
exports.SceneChildSchema = zod_1.z.object({
    component: exports.ComponentNameSchema,
    props: zod_1.z.record(zod_1.z.unknown()),
    // Optional metadata for educational validation
    educationalRole: zod_1.z.string().optional(),
    concept: zod_1.z.string().optional(),
});
// Enhanced scene instruction with educational metadata
exports.SceneInstructionSchema = zod_1.z.object({
    id: zod_1.z.string().min(1),
    startFrame: zod_1.z.number().int().nonnegative(),
    endFrame: zod_1.z.number().int().positive(),
    component: exports.ComponentNameSchema,
    props: zod_1.z.record(zod_1.z.unknown()),
    children: zod_1.z.array(exports.SceneChildSchema).optional(),
    // Educational metadata
    concept: zod_1.z.string().optional(),
    visualStrategy: zod_1.z.string().optional(),
    // Additive, optional planning fields. Older storyboards parse unchanged.
    purpose: zod_1.z.string().optional(),
    visualBrief: zod_1.z.string().optional(),
    keyTerms: zod_1.z.array(zod_1.z.string()).optional(),
    assetQueries: zod_1.z.array(zod_1.z.string()).optional(),
    animationIntent: zod_1.z.string().optional(),
    transition: zod_1.z.string().optional(),
    cameraMovement: zod_1.z.enum(['zoomIn', 'zoomOut', 'panLeft', 'panRight', 'static']).optional(),
}).refine((s) => s.endFrame > s.startFrame, {
    message: 'endFrame must be greater than startFrame',
});
// Enhanced storyboard plan with validation
exports.StoryboardPlanSchema = zod_1.z.object({
    jobId: zod_1.z.string().min(1),
    totalFrames: zod_1.z.number().int().positive(),
    fps: zod_1.z.number().int().positive(),
    audioDurationMs: zod_1.z.number().nonnegative(),
    scenes: zod_1.z.array(exports.SceneInstructionSchema).min(1),
    // Metadata for validation
    topic: zod_1.z.string().optional(),
    domain: zod_1.z.string().optional(),
    educationalObjective: zod_1.z.string().optional(),
    /** New storyboards declare that child startFrame values are scene-relative. */
    timingMode: zod_1.z.enum(['scene-relative']).optional(),
}).superRefine((plan, ctx) => {
    // Validate frame continuity
    const scenes = plan.scenes;
    if (scenes && scenes.length >= 2) {
        for (let i = 0; i < scenes.length - 1; i++) {
            const current = scenes[i];
            const next = scenes[i + 1];
            if (current && next && current.endFrame !== next.startFrame) {
                ctx.addIssue({
                    code: zod_1.z.ZodIssueCode.custom,
                    message: `Frame gap between scene ${current.id} (ends at ${current.endFrame}) and scene ${next.id} (starts at ${next.startFrame})`,
                    path: ['scenes'],
                });
            }
        }
    }
    // Validate last scene ends at totalFrames
    if (scenes && scenes.length > 0) {
        const lastScene = scenes[scenes.length - 1];
        if (lastScene && lastScene.endFrame !== plan.totalFrames) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: `Last scene should end at totalFrames (${plan.totalFrames}), but ends at ${lastScene.endFrame}`,
                path: ['scenes'],
            });
        }
    }
});
// Validation schema for visual relevance
exports.VisualRelevanceSchema = zod_1.z.object({
    assetId: zod_1.z.string(),
    concept: zod_1.z.string(),
    relevanceScore: zod_1.z.number().min(0).max(1),
    isRelevant: zod_1.z.boolean(),
    reason: zod_1.z.string().optional(),
});
// Scene validation result
exports.SceneValidationSchema = zod_1.z.object({
    sceneId: zod_1.z.string(),
    isValid: zod_1.z.boolean(),
    issues: zod_1.z.array(zod_1.z.string()),
    warnings: zod_1.z.array(zod_1.z.string()),
    hasVisual: zod_1.z.boolean(),
    hasText: zod_1.z.boolean(),
    hasSubtitle: zod_1.z.boolean(),
    visualRelevance: zod_1.z.number().min(0).max(1).optional(),
});
// Complete storyboard validation result
exports.StoryboardValidationSchema = zod_1.z.object({
    isValid: zod_1.z.boolean(),
    totalScenes: zod_1.z.number().int().positive(),
    validScenes: zod_1.z.number().int().nonnegative(),
    sceneResults: zod_1.z.array(exports.SceneValidationSchema),
    overallIssues: zod_1.z.array(zod_1.z.string()),
    recommendations: zod_1.z.array(zod_1.z.string()),
});
