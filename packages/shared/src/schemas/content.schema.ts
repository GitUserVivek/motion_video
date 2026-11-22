import { z } from 'zod';

/**
 * Structured understanding of the approved narration.
 *
 * This is deliberately derived from the script the viewer will actually hear, not
 * from the user's topic string or a fixed keyword table. The storyboard,
 * asset search and validation all read the same object, so “technology” can no
 * longer leak into a video about business profit and loss merely because the
 * word appears once.
 */

export const ContentClaimKindSchema = z.enum([
  'number',
  'percentage',
  'date',
  'formula',
  'statistic',
  'other',
]);

export const ContentClaimStatusSchema = z.enum([
  'supported',
  'unverified',
  'needsResearch',
]);

export const ContentClaimSchema = z.object({
  text: z.string().min(1),
  kind: ContentClaimKindSchema.default('other'),
  value: z.string().optional(),
  status: ContentClaimStatusSchema.default('unverified'),
  source: z.string().optional(),
  note: z.string().optional(),
});

export const ContentKeyTermSchema = z.object({
  term: z.string().min(1),
  meaning: z.string().default(''),
  synonyms: z.array(z.string()).default([]),
  visualCandidates: z.array(z.string()).default([]),
});

export const ResearchSourceSchema = z.object({
  provider: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  extract: z.string().default(''),
  retrievedAt: z.string().min(1),
  licence: z.string().optional(),
});

export const ContentAnalysisSchema = z.object({
  topic: z.string().min(1),
  domain: z.string().min(1).default('general'),
  subtopics: z.array(z.string()).default([]),
  audience: z.string().default('curious learners'),
  learningObjectives: z.array(z.string()).default([]),
  keyTerms: z.array(ContentKeyTermSchema).default([]),
  claims: z.array(ContentClaimSchema).default([]),
  visualStyle: z.string().default('clean educational illustration'),
  exampleIdeas: z.array(z.string()).default([]),
  researchNeeded: z.boolean().default(false),
  researchNotes: z.array(z.string()).default([]),
  sources: z.array(ResearchSourceSchema).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
});

export type ContentClaimKind = z.infer<typeof ContentClaimKindSchema>;
export type ContentClaimStatus = z.infer<typeof ContentClaimStatusSchema>;
export type ContentClaim = z.infer<typeof ContentClaimSchema>;
export type ContentKeyTerm = z.infer<typeof ContentKeyTermSchema>;
export type ResearchSource = z.infer<typeof ResearchSourceSchema>;
export type ContentAnalysis = z.infer<typeof ContentAnalysisSchema>;
