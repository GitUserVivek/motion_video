import { z } from 'zod';

// Enhanced component names with new educational components
export const ComponentNameSchema = z.enum([
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
  'QuestionReveal',
  'FactHighlight',
  'ScientificVisualization',
  'ChartAnimation',
  'BeforeAfterComparison',
]);

export type ComponentName = z.infer<typeof ComponentNameSchema>;

// Enhanced educational object types
export const EducationalObjectTypeSchema = z.enum([
  'book', 'apple', 'globe', 'atom', 'lightbulb', 'calculator', 'pencil', 'star',
  'leaf', 'plant', 'sun', 'water', 'cloud', 'rocket', 'heart', 'cell', 'microscope',
  'brain', 'bone', 'skeleton', 'dna', 'neuron', 'circuit', 'server', 'network',
  'equation', 'chart', 'timeline', 'beaker', 'testtube', 'molecule', 'electron',
  'proton', 'neutron', 'bacteria', 'virus', 'organ', 'femur', 'skull', 'ribcage'
]);

export type EducationalObjectType = z.infer<typeof EducationalObjectTypeSchema>;

// Enhanced subtitle entry with word-level timing
export const SubtitleEntrySchema = z.object({
  index: z.number().int().nonnegative(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
  text: z.string().min(1),
  // Optional word-level timing for better synchronization
  words: z.array(z.object({
    text: z.string(),
    startMs: z.number().nonnegative(),
    endMs: z.number().nonnegative(),
  })).optional(),
});

export type SubtitleEntry = z.infer<typeof SubtitleEntrySchema>;

// Enhanced scene child with validation for educational content
export const SceneChildSchema = z.object({
  component: ComponentNameSchema,
  props: z.record(z.unknown()),
  // Optional metadata for educational validation
  educationalRole: z.string().optional(), // e.g., "main_visual", "supporting", "label", "animation"
  concept: z.string().optional(), // What concept this visual represents
});

export type SceneChild = z.infer<typeof SceneChildSchema>;

// Enhanced scene instruction with educational metadata
export const SceneInstructionSchema = z.object({
  id: z.string().min(1),
  startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().positive(),
  component: ComponentNameSchema,
  props: z.record(z.unknown()),
  children: z.array(SceneChildSchema).optional(),
  // Educational metadata
  concept: z.string().optional(), // Main concept taught in this scene
  visualStrategy: z.string().optional(), // How visuals support the narration
  cameraMovement: z.enum(['zoomIn', 'zoomOut', 'panLeft', 'panRight', 'static']).optional(),
}).refine((s) => s.endFrame > s.startFrame, {
  message: 'endFrame must be greater than startFrame',
});

export type SceneInstruction = z.infer<typeof SceneInstructionSchema>;

// Enhanced storyboard plan with validation
export const StoryboardPlanSchema = z.object({
  jobId: z.string().min(1),
  totalFrames: z.number().int().positive(),
  fps: z.number().int().positive(),
  audioDurationMs: z.number().nonnegative(),
  scenes: z.array(SceneInstructionSchema).min(1),
  // Metadata for validation
  topic: z.string().optional(),
  educationalObjective: z.string().optional(),
}).refine((plan) => {
  // Validate frame continuity
  const scenes = plan.scenes;
  for (let i = 0; i < scenes.length - 1; i++) {
    if (scenes[i].endFrame !== scenes[i + 1].startFrame) {
      return false;
    }
  }
  return true;
}, {
  message: 'Scene frames must be contiguous',
}).refine((plan) => {
  // Validate last scene ends at totalFrames
  const lastScene = plan.scenes[plan.scenes.length - 1];
  return lastScene.endFrame === plan.totalFrames;
}, {
  message: 'Last scene must end at totalFrames',
});

export type StoryboardPlan = z.infer<typeof StoryboardPlanSchema>;

// Validation schema for visual relevance
export const VisualRelevanceSchema = z.object({
  assetId: z.string(),
  concept: z.string(),
  relevanceScore: z.number().min(0).max(1),
  isRelevant: z.boolean(),
  reason: z.string().optional(),
});

export type VisualRelevance = z.infer<typeof VisualRelevanceSchema>;

// Scene validation result
export const SceneValidationSchema = z.object({
  sceneId: z.string(),
  isValid: z.boolean(),
  issues: z.array(z.string()),
  warnings: z.array(z.string()),
  hasVisual: z.boolean(),
  hasText: z.boolean(),
  hasSubtitle: z.boolean(),
  visualRelevance: z.number().min(0).max(1).optional(),
});

export type SceneValidation = z.infer<typeof SceneValidationSchema>;

// Complete storyboard validation result
export const StoryboardValidationSchema = z.object({
  isValid: z.boolean(),
  totalScenes: z.number().int().positive(),
  validScenes: z.number().int().nonnegative(),
  sceneResults: z.array(SceneValidationSchema),
  overallIssues: z.array(z.string()),
  recommendations: z.array(z.string()),
});

export type StoryboardValidation = z.infer<typeof StoryboardValidationSchema>;
