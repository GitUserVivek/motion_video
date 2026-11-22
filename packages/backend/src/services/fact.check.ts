import type { ContentAnalysis, ContentClaim, ResearchSource } from '@edumotion/shared';

/**
 * Verify the exact facts that appear on screen.
 *
 * This is intentionally conservative: a number/date is "supported" only when the
 * same token appears in a fetched source. Anything else stays "unverified" and is
 * reported to the script-generation/validation flow. The checker never invents a
 * source and never upgrades a claim just because it sounds plausible.
 */

const NUMBER_PATTERN =
  /\b\d[\d,]*(?:\.\d+)?\s*(?:%|percent(?:\s+points?)?|billion|million|thousand|km|kg|grams?|met(?:er|re)s?|seconds?|minutes?|hours?|days?|years?|degrees?|°)?/gi;
const YEAR_PATTERN = /\b(?:1[5-9]\d{2}|20\d{2})\b/g;
const FORMULA_PATTERN = /[A-Za-z0-9()]+\s*=\s*[A-Za-z0-9()+\-*/.\s]+/g;

function claimTokens(claim: ContentClaim): string[] {
  const text = `${claim.text} ${claim.value ?? ''}`;
  const tokens: string[] = [];
  for (const pattern of [NUMBER_PATTERN, YEAR_PATTERN, FORMULA_PATTERN]) {
    for (const match of text.match(pattern) ?? []) {
      const normalized = match.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.length > 0) tokens.push(normalized);
    }
  }
  return [...new Set(tokens)];
}

function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[–—]/g, '-')
    .trim();
}

export interface ClaimCheckResult {
  claims: ContentClaim[];
  supported: number;
  unverified: number;
  issues: string[];
}

export function verifyClaims(
  claims: ContentClaim[],
  sources: ResearchSource[],
): ClaimCheckResult {
  const corpus = sources.map((source) => normalizeForCompare(source.extract));
  const issues: string[] = [];
  let supported = 0;
  let unverified = 0;

  const checked = claims.map((claim) => {
    const tokens = claimTokens(claim);

    if (tokens.length === 0) {
      unverified++;
      return {
        ...claim,
        status: 'unverified' as const,
        note: claim.note ?? 'No measurable value found; review manually.',
      };
    }

    const matchedSource = sources.find((source) => {
      const text = normalizeForCompare(source.extract);
      return tokens.every((token) => text.includes(normalizeForCompare(token)));
    });

    if (matchedSource) {
      supported++;
      return {
        ...claim,
        status: 'supported' as const,
        source: matchedSource.url,
        note: claim.note,
      };
    }

    unverified++;
    issues.push(
      `Unverified claim: "${claim.text}"${claim.value ? ` (${claim.value})` : ''}` +
        (sources.length === 0 ? ' — no research source available.' : ' — not found in sources.'),
    );
    return {
      ...claim,
      status: 'unverified' as const,
      note: claim.note ?? (sources.length === 0
        ? 'No research source available; do not present as a verified fact.'
        : 'Value was not found in the retrieved sources; do not present as verified.'),
    };
  });

  return { claims: checked, supported, unverified, issues };
}

/** Queries derived from the analysis, used only when research is needed. */
export function researchQueriesFor(analysis: ContentAnalysis): string[] {
  const queries = [
    analysis.topic,
    analysis.domain,
    ...analysis.researchNotes,
    ...analysis.keyTerms.map((term) => term.term),
  ];
  return [...new Set(queries.map((query) => query.trim()).filter((query) => query.length > 2))]
    .slice(0, 4);
}

/** Flag claims that the script should not state as fact. */
export function claimsToAvoid(analysis: ContentAnalysis): ContentClaim[] {
  return analysis.claims.filter((claim) => claim.status !== 'supported');
}
