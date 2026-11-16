import { z } from 'zod';

export const ComponentNameSchema = z.enum([
  'AnimatedText',
  'AnimatedNumber',
  'Character',
  'Teacher',
  'EducationalObject',
  'ObjectGroup',
  'MultiplicationTable',
  'ImageScene',
  'BackgroundScene',
  'Subtitle',
  'QuestionCard',
  'Confetti',
  'EndScreen',
  'ProgressBar',
]);

export const SubtitleEntrySchema = z.object({
  index: z.number().int().nonnegative(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
  text: z.string().min(1),
});

export const SceneChildSchema = z.object({
  component: ComponentNameSchema,
  props: z.record(z.unknown()),
});

export const SceneInstructionSchema = z.object({
  id: z.string().min(1),
  startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().positive(),
  component: ComponentNameSchema,
  props: z.record(z.unknown()),
  children: z.array(SceneChildSchema).optional(),
}).refine((s) => s.endFrame > s.startFrame, {
  message: 'endFrame must be greater than startFrame',
});

export const StoryboardPlanSchema = z.object({
  jobId: z.string().min(1),
  totalFrames: z.number().int().positive(),
  fps: z.number().int().positive(),
  audioDurationMs: z.number().nonnegative(),
  scenes: z.array(SceneInstructionSchema).min(1),
});

export type SceneInstructionInput = z.input<typeof SceneInstructionSchema>;
export type StoryboardPlanInput = z.input<typeof StoryboardPlanSchema>;
