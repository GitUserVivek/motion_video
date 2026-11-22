"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentAnalysisSchema = exports.ResearchSourceSchema = exports.ContentKeyTermSchema = exports.ContentClaimSchema = exports.ContentClaimStatusSchema = exports.ContentClaimKindSchema = void 0;
const zod_1 = require("zod");
/**
 * Structured understanding of the approved narration.
 *
 * This is deliberately derived from the script the viewer will actually hear, not
 * from the user's topic string or a fixed keyword table. The storyboard,
 * asset search and validation all read the same object, so “technology” can no
 * longer leak into a video about business profit and loss merely because the
 * word appears once.
 */
exports.ContentClaimKindSchema = zod_1.z.enum([
    'number',
    'percentage',
    'date',
    'formula',
    'statistic',
    'other',
]);
exports.ContentClaimStatusSchema = zod_1.z.enum([
    'supported',
    'unverified',
    'needsResearch',
]);
exports.ContentClaimSchema = zod_1.z.object({
    text: zod_1.z.string().min(1),
    kind: exports.ContentClaimKindSchema.default('other'),
    value: zod_1.z.string().optional(),
    status: exports.ContentClaimStatusSchema.default('unverified'),
    source: zod_1.z.string().optional(),
    note: zod_1.z.string().optional(),
});
exports.ContentKeyTermSchema = zod_1.z.object({
    term: zod_1.z.string().min(1),
    meaning: zod_1.z.string().default(''),
    synonyms: zod_1.z.array(zod_1.z.string()).default([]),
    visualCandidates: zod_1.z.array(zod_1.z.string()).default([]),
});
exports.ResearchSourceSchema = zod_1.z.object({
    provider: zod_1.z.string().min(1),
    title: zod_1.z.string().min(1),
    url: zod_1.z.string().url(),
    extract: zod_1.z.string().default(''),
    retrievedAt: zod_1.z.string().min(1),
    licence: zod_1.z.string().optional(),
});
exports.ContentAnalysisSchema = zod_1.z.object({
    topic: zod_1.z.string().min(1),
    domain: zod_1.z.string().min(1).default('general'),
    subtopics: zod_1.z.array(zod_1.z.string()).default([]),
    audience: zod_1.z.string().default('curious learners'),
    learningObjectives: zod_1.z.array(zod_1.z.string()).default([]),
    keyTerms: zod_1.z.array(exports.ContentKeyTermSchema).default([]),
    claims: zod_1.z.array(exports.ContentClaimSchema).default([]),
    visualStyle: zod_1.z.string().default('clean educational illustration'),
    exampleIdeas: zod_1.z.array(zod_1.z.string()).default([]),
    researchNeeded: zod_1.z.boolean().default(false),
    researchNotes: zod_1.z.array(zod_1.z.string()).default([]),
    sources: zod_1.z.array(exports.ResearchSourceSchema).default([]),
    confidence: zod_1.z.number().min(0).max(1).default(0.5),
});
