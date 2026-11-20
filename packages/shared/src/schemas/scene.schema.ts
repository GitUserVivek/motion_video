import { z } from 'zod';

// Import from storyboard.schema to avoid duplication
export { ComponentNameSchema, SubtitleEntrySchema, StoryboardPlanSchema } from './storyboard.schema.js';
export type { ComponentName, SubtitleEntry, StoryboardPlan } from './storyboard.schema.js';

// Re-export SceneChildSchema and SceneInstructionSchema for backward compatibility
export const SceneChildSchema = z.object({
  component: ComponentNameSchema,
  props: z.record(z.unknown()),
  educationalRole: z.string().optional(),
  concept: z.string().optional(),
});

export const SceneInstructionSchema = z.object({
  id: z.string().min(1),
  startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().positive(),
  component: ComponentNameSchema,
  props: z.record(z.unknown()),
  children: z.array(SceneChildSchema).optional(),
  concept: z.string().optional(),
  visualStrategy: z.string().optional(),
  cameraMovement: z.enum(['zoomIn', 'zoomOut', 'panLeft', 'panRight', 'static']).optional(),
}).refine((s) => s.endFrame > s.startFrame, {
  message: 'endFrame must be greater than startFrame',
});

export type SceneInstructionInput = z.input<typeof SceneInstructionSchema>;
export type StoryboardPlanInput = z.input<typeof StoryboardPlanSchema>;
