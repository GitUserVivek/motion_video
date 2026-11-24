import fs from 'fs';
import path from 'path';
import { ContentAnalysisSchema, type ContentAnalysis, type ContentClaim } from '@edumotion/shared';
import { ollamaService } from './ollama.service.js';
import { parseLooseJson } from './json.repair.js';
import { buildContentAnalysisPrompt } from '../prompts/content-analysis.prompt.js';
import { jobFiles } from './job.files.js';
import { researchService } from './research.service.js';
import { researchQueriesFor, verifyClaims } from './fact.check.js';
import { logInfo, logStep, logSuccess, logWarn } from '../logger.js';

/**
 * Understand the narration before any visual decision is made.
 *
 * The model produces the analysis; a deterministic, low-confidence analysis is
 * built from the words themselves if the model is unavailable or returns broken
 * JSON. Research is optional and only attempted when the analysis names facts
 * that need checking. A failed lookup leaves the job runnable and the claim
 * explicitly unverified.
 */

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'been', 'were',
  'will', 'into', 'than', 'then', 'they', 'them', 'their', 'there', 'here',
  'its', 'our', 'your', 'you', 'are', 'was', 'but', 'not', 'can', 'could',
  'would', 'should', 'about', 'when', 'where', 'which', 'while', 'what', 'how',
  'why', 'who', 'all', 'any', 'each', 'more', 'most', 'some', 'such', 'very',
  'also', 'just', 'like', 'over', 'under', 'between', 'through', 'because',
  'these', 'those', 'one', 'two', 'use', 'uses', 'used', 'make', 'makes',
  'made', 'get', 'gets', 'got', 'has', 'had', 'does', 'did', 'doing', 'being',
  'imagine', 'example', 'called', 'around', 'every', 'never', 'always', 'much',
]);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9% ]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOPWORDS.has(word));
}

function firstTopicSentence(text: string): string {
  const sentence = text.split(/\n+/).map((line) => line.trim()).find(Boolean) ?? text.trim();
  const cleaned = sentence
    .replace(/^(?:have|do|does|did|can|could|would|what|why|how|when|where|who|is|are|was|were)\s+/i, '')
    .replace(/[.!?]+$/, '')
    .trim();
  const limited = cleaned.split(/\s+/).slice(0, 8).join(' ');
  return limited || 'educational topic';
}

function claimKindFor(sentence: string): ContentClaim['kind'] {
  if (/\b\d[\d,]*(?:\.\d+)?\s*%|\bpercent/i.test(sentence)) return 'percentage';
  if (/\b(?:1[5-9]\d{2}|20\d{2})\b/.test(sentence)) return 'date';
  if (/[A-Za-z0-9()]+\s*=\s*[A-Za-z0-9()+\-*/.\s]+/.test(sentence)) return 'formula';
  if (/\b\d[\d,]*(?:\.\d+)?\s*(?:billion|million|thousand)\b/i.test(sentence)) return 'statistic';
  if (/\b\d[\d,]*(?:\.\d+)?\b/.test(sentence)) return 'number';
  return 'other';
}

function measureClaimValue(sentence: string): string | undefined {
  const match = sentence.match(
    /\b\d[\d,]*(?:\.\d+)?\s*(?:%|percent|billion|million|thousand|km|kg|grams?|met(?:er|re)s?|seconds?|minutes?|hours?|days?|years?|degrees?|°)?/i,
  );
  return match?.[0]?.trim();
}

/** Deterministic fallback: only what the narration itself supports. */
export function deriveContentAnalysis(input: {
  topic?: string;
  script?: string;
}): ContentAnalysis {
  const script = input.script?.trim() ?? '';
  const source = script || input.topic?.trim() || '';

  const counts = new Map<string, number>();
  for (const word of words(source)) counts.set(word, (counts.get(word) ?? 0) + 1);
  const keyTerms = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([term]) => ({
      term,
      meaning: '',
      synonyms: [],
      visualCandidates: [term],
    }));

  const sentences = source
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const claims: ContentClaim[] = sentences
    .filter((sentence) =>
      /\b\d[\d,]*(?:\.\d+)?\b|\b(?:1[5-9]\d{2}|20\d{2})\b|[A-Za-z0-9()]+\s*=\s*[A-Za-z0-9()+\-*/.\s]+/.test(
        sentence,
      ),
    )
    .slice(0, 8)
    .map((sentence) => ({
      text: sentence,
      kind: claimKindFor(sentence),
      value: measureClaimValue(sentence),
      status: 'unverified' as const,
      note: 'Derived without a content model; review before treating as fact.',
    }));

  return ContentAnalysisSchema.parse({
    topic: firstTopicSentence(source),
    domain: 'general',
    subtopics: [],
    audience: 'curious learners',
    learningObjectives: [],
    keyTerms,
    claims,
    visualStyle: 'clean educational illustration',
    exampleIdeas: [],
    researchNeeded: claims.length > 0,
    researchNotes: claims.length > 0 ? ['Verify the numbers and dates in the narration.'] : [],
    sources: [],
    confidence: 0.25,
  });
}

function writeJsonSafe(filePath: string, data: unknown): void {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn(
      `[Content] Could not write ${path.basename(filePath)}: ` +
        (err instanceof Error ? err.message : String(err)),
    );
  }
}

class ContentAnalysisService {
  /**
   * Analyse a topic or an approved script.
   *
   * `research` defaults to true but only runs when claims exist. `useLlm` is
   * false in deterministic tests and for the storyboard-only fallback.
   */
  async analyze(options: {
    topic?: string;
    script?: string;
    jobId?: string;
    useLlm?: boolean;
    research?: boolean;
  }): Promise<ContentAnalysis> {
    const useLlm = options.useLlm !== false;
    const input = options.topic
      ? `topic "${options.topic}"`
      : `${options.script?.length ?? 0} chars of narration`;
    logStep('Content', `Analyzing ${input}`, '🧠');
    let analysis: ContentAnalysis | null = null;

    if (useLlm) {
      try {
        const raw = await ollamaService.chat(
          [
            {
              role: 'system',
              content:
                'You are a precise educational content analyst. Return only valid JSON. ' +
                'Never invent sources or statistics.',
            },
            {
              role: 'user',
              content: buildContentAnalysisPrompt({
                topic: options.topic,
                script: options.script,
              }),
            },
          ],
          { temperature: 0.2, num_predict: 1600 },
        );

        const parsed = ContentAnalysisSchema.safeParse(parseLooseJson(raw));
        if (parsed.success) {
          analysis = parsed.data;
          logSuccess(
            'Content',
            `Analysed "${analysis.topic}" — domain ${analysis.domain}, ` +
              `${analysis.keyTerms.length} key term(s), ${analysis.claims.length} claim(s)`,
          );
        } else {
          logWarn(
            'Content',
            'Analysis JSON failed validation, using narration-derived fallback: ' +
              parsed.error.errors.slice(0, 3).map((issue) => issue.message).join('; '),
          );
        }
      } catch (err) {
        logWarn(
          'Content',
          'Analysis model failed, using narration-derived fallback: ' +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    analysis ??= deriveContentAnalysis({ topic: options.topic, script: options.script });

    const shouldResearch =
      options.research !== false &&
      (analysis.researchNeeded || analysis.claims.some((claim) => claim.status !== 'supported'));

    if (shouldResearch) {
      const queries = researchQueriesFor(analysis);
      logStep('Research', `Checking ${queries.length} quer(y/ies)`, '🔎');
      const research = await researchService.gather(queries);
      if (research.sources.length > 0) {
        logSuccess('Research', `${research.sources.length} source(s) found`);
        analysis = {
          ...analysis,
          sources: research.sources,
          researchNeeded: false,
          researchNotes: [...analysis.researchNotes, ...research.errors],
        };
      } else if (research.enabled) {
        logWarn('Research', 'No sources found; claims stay unverified');
        analysis = {
          ...analysis,
          researchNotes: [...analysis.researchNotes, ...research.errors],
        };
      }

      const checked = verifyClaims(analysis.claims, analysis.sources);
      analysis = {
        ...analysis,
        claims: checked.claims,
        researchNeeded: checked.unverified > 0,
        researchNotes: [...analysis.researchNotes, ...checked.issues].slice(0, 12),
      };
      if (checked.unverified > 0) {
        logWarn('Content', `${checked.unverified} unsupported claim(s) remain unverified`);
      }
    } else {
      // Still normalise statuses even when research is disabled.
      const checked = verifyClaims(analysis.claims, analysis.sources);
      analysis = { ...analysis, claims: checked.claims };
    }

    if (options.jobId) {
      writeJsonSafe(jobFiles.contentAnalysis(options.jobId), {
        ...analysis,
        createdAt: new Date().toISOString(),
      });
      writeJsonSafe(jobFiles.research(options.jobId), {
        enabled: shouldResearch,
        provider: analysis.sources[0]?.provider ?? 'none',
        sources: analysis.sources,
        notes: analysis.researchNotes,
      });
      logInfo('Content', `Saved analysis and research reports for job ${options.jobId}`);
    }

    return analysis;
  }
}

export const contentAnalysisService = new ContentAnalysisService();
