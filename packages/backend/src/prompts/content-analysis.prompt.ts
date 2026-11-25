import type { ContentAnalysis } from '@edumotion/shared';

/**
 * Ask the local model to understand the narration before it plans pictures.
 *
 * The output is consumed by the storyboard prompt, the scene director, asset
 * discovery and validation, so the schema is strict and the model is told not to
 * wrap the JSON in markdown.
 */
export function buildContentAnalysisPrompt(input: {
  topic?: string;
  script?: string;
}): string {
  const script = input.script?.trim();
  const topic = input.topic?.trim();

  const source = script
    ? `APPROVED NARRATION (the only source of truth):\n${script}`
    : `TOPIC (no narration exists yet; infer carefully and mark uncertain claims):\n${topic ?? ''}`;

  return `You are an educational content analyst. Read the material below and return ONE JSON object that describes what the video is actually about. Do not write a script, do not give advice, and do not use markdown.

${source}

Return this exact shape (all keys required):
{
  "topic": "short specific topic, e.g. 'profit and loss in a small business'",
  "domain": "business/finance | biology | physics | history | mathematics | technology | geography | health | general | ...",
  "subtopics": ["2-5 specific subtopics"],
  "audience": "who this is for",
  "learningObjectives": ["2-4 things the viewer should understand"],
  "keyTerms": [
    {
      "term": "word or phrase from the narration",
      "meaning": "one plain-language sentence",
      "synonyms": ["other words the narration uses for it"],
      "visualCandidates": ["specific illustration/object that genuinely represents this term"]
    }
  ],
  "claims": [
    {
      "text": "the exact sentence containing a number, date, formula or statistic",
      "kind": "number | percentage | date | formula | statistic | other",
      "value": "the number/date/formula as written, if any",
      "status": "unverified",
      "source": "",
      "note": "why it matters or what must be checked"
    }
  ],
  "visualStyle": "specific visual language that fits this domain",
  "exampleIdeas": ["concrete example or analogy that would help explain this"],
  "researchNeeded": true,
  "researchNotes": ["what facts need checking"],
  "confidence": 0.0
}

RULES:
- Derive everything from the material above. Never infer the domain from a single incidental word.
- Quote the narration exactly as written: never translate its sentences or terms into English, so a claim can be matched back to the script.
- "business profit and loss" is business/finance, not technology, even if the script mentions a computer or software once.
- List only terms that are central to understanding the narration, at most 8.
- "visualCandidates" must name things that can actually be drawn or illustrated. Never use generic labels like "idea", "concept" or "information".
- For every claim, copy the sentence and mark it "unverified" unless the material itself provides a source. Do not invent a source.
- If there are no measurable claims, use an empty array and set "researchNeeded" to false.
- "confidence" is your honest 0-1 confidence in the analysis.
- Output only the JSON object.`;
}

/** Compact context inserted into the script-generation prompt. */
export function formatContentAnalysisForScript(analysis: ContentAnalysis): string {
  const objectives = analysis.learningObjectives.slice(0, 4);
  const terms = analysis.keyTerms.slice(0, 8);
  const facts = analysis.claims
    .filter((claim) => claim.status === 'supported' && claim.source)
    .slice(0, 6);

  const lines = [
    `TOPIC: ${analysis.topic}`,
    `DOMAIN: ${analysis.domain}`,
    `AUDIENCE: ${analysis.audience}`,
  ];

  if (objectives.length > 0) {
    lines.push(`LEARNING OBJECTIVES:\n${objectives.map((item) => `- ${item}`).join('\n')}`);
  }
  if (terms.length > 0) {
    lines.push(
      `KEY TERMS (use these accurately):\n${terms
        .map((item) => `- ${item.term}: ${item.meaning}`)
        .join('\n')}`,
    );
  }
  if (facts.length > 0) {
    lines.push(
      `VERIFIED FACTS (the only numbers/statistics you may use):\n${facts
        .map((claim) => `- ${claim.text}${claim.source ? ` [${claim.source}]` : ''}`)
        .join('\n')}`,
    );
  } else {
    lines.push(
      'VERIFIED FACTS: none supplied. Do NOT invent statistics or precise numbers; explain qualitatively or use a concrete example.',
    );
  }

  return lines.join('\n');
}

/** Compact context inserted into the storyboard prompt. */
export function formatContentAnalysisForStoryboard(analysis: ContentAnalysis): string {
  const terms = analysis.keyTerms.slice(0, 10);
  const objectives = analysis.learningObjectives.slice(0, 4);
  const examples = analysis.exampleIdeas.slice(0, 4);
  const facts = analysis.claims
    .filter((claim) => claim.status === 'supported')
    .slice(0, 6);

  const lines = [
    `TOPIC: ${analysis.topic}`,
    `DOMAIN: ${analysis.domain}`,
    `AUDIENCE: ${analysis.audience}`,
    `VISUAL STYLE: ${analysis.visualStyle}`,
  ];

  if (objectives.length > 0) {
    lines.push(`LEARNING OBJECTIVES:\n${objectives.map((item) => `- ${item}`).join('\n')}`);
  }
  if (terms.length > 0) {
    lines.push(
      `KEY TERMS AND APPROPRIATE IMAGERY:\n${terms
        .map((item) => {
          const visuals = item.visualCandidates.length > 0
            ? ` (usable visuals: ${item.visualCandidates.join(', ')})`
            : '';
          return `- ${item.term}: ${item.meaning}${visuals}`;
        })
        .join('\n')}`,
    );
  }
  if (examples.length > 0) {
    lines.push(`EXAMPLE IDEAS:\n${examples.map((item) => `- ${item}`).join('\n')}`);
  }
  if (facts.length > 0) {
    lines.push(
      `FACTS THAT MAY BE SHOWN OR QUOTED:\n${facts
        .map((claim) => `- ${claim.text}${claim.source ? ` [${claim.source}]` : ''}`)
        .join('\n')}`,
    );
  }

  return lines.join('\n');
}
