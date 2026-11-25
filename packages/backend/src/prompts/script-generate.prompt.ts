import { languageName, normalizeLanguage, type ContentAnalysis } from '@edumotion/shared';
import { formatContentAnalysisForScript } from './content-analysis.prompt.js';

/**
 * The narration language is a hard requirement, not a hint. A 7B model happily
 * ignores "language: mr" and answers in English, so a Marathi run gets explicit
 * script, numeral and punctuation rules.
 */
export function languageRules(language: string): string {
  if (normalizeLanguage(language) === 'mr') {
    return `LANGUAGE (MANDATORY): Write the entire narration in Marathi (मराठी) using Devanagari script.
- Never write the narration in English, and never transliterate Marathi into Latin letters.
- Write numbers as spoken Marathi words, not digits.
- End every sentence with the Marathi full stop (।), or with ? or ! for questions and exclamations.
- Where the style rules above name English habits (contractions, "you" and "we"), write the way a Marathi teacher actually speaks to a class: natural spoken Marathi, not textbook prose.
- Keep technical terms in Marathi when a common word exists; otherwise use the familiar English term written in Devanagari.`;
  }
  return `LANGUAGE (MANDATORY): Write the entire narration in ${languageName(language)}.`;
}

export function buildScriptGeneratePrompt(
  topic: string,
  durationSeconds: number,
  language: string,
  analysis?: ContentAnalysis,
): string {
  const wordCount = Math.round(durationSeconds * 2.5);
  const sentenceCount = Math.max(6, Math.round(durationSeconds / 7));
  const analysisBlock = analysis ? formatContentAnalysisForScript(analysis) : '';

  return `You are an expert educational content creator. Write a professional, engaging educational script for a ${durationSeconds}-second explainer video about: ${topic}

${analysisBlock ? `CONTENT BRIEF (derived from the actual subject):\n${analysisBlock}\n` : ''}

STRUCTURE REQUIREMENTS (MANDATORY):
1. HOOK (First 1-2 sentences): Start with a surprising fact, thought-provoking question, common misconception, or relatable situation to grab attention and create curiosity.
2. INTRODUCTION (Next 1-2 sentences): Introduce the main concept and why it matters. Explain what we'll learn.
3. MAIN EXPLANATION (Middle sentences): Break down the concept progressively from simple to complex. Use the following techniques:
   - Explain WHY things happen, not just WHAT happens
   - Use real-world examples and analogies from the content brief
   - Include a number, date or statistic ONLY when it appears in VERIFIED FACTS; otherwise explain the idea qualitatively
   - Show cause-and-effect relationships
   - Use step-by-step reasoning
4. PRACTICAL APPLICATION (1-2 sentences): Show how this knowledge is useful in real life.
5. CONCLUSION (Final 1-2 sentences): End with a memorable takeaway, summary, or call-to-action.

CONTENT REQUIREMENTS:
- ${sentenceCount} to ${sentenceCount + 2} sentences total, about ${wordCount} words
- One sentence per line
- Every sentence ends with a period, question mark, or exclamation mark
- Short, spoken sentences: 8-18 words each
- Use natural, conversational language with contractions
- Use everyday words, avoid jargon (or explain it immediately)
- Include at least ONE analogy or concrete real-world example
- Include at least ONE "why" or "how" explanation
- Never invent statistics, dates, sources, formulas or precise numbers. If you are unsure, describe the idea without the number.
- Progress from basic to advanced understanding

STYLE REQUIREMENTS:
- Write like you're talking to a curious friend
- Use "you" and "we" to create connection
- Use active voice, not passive
- Use vivid, descriptive language
- Vary sentence length and structure
- Avoid repetition
- No markdown, no headings, no bullet points, no numbering
- No emoji, no stage directions, no notes
- Do NOT begin with "In this video", "Welcome", "Hello", or "Today we'll"

EDUCATIONAL TECHNIQUES TO USE:
- Pose questions to the viewer
- Use comparisons ("like", "similar to")
- Explain benefits and importance
- Use the word "imagine" to create mental pictures
- Use "because" to explain causes
- Use "so that" to explain purposes
- Use "for example" to illustrate
- Use "that means" to clarify

STYLE: open with a question or concrete situation, define the idea in plain language, show one example or analogy, explain the cause-and-effect, and close with a takeaway. The exact wording must come from the content brief and the topic — do not reuse a stock example from another subject.

${languageRules(language)}

Write the script now in ${languageName(language)}. DO NOT add any explanation, commentary, or markdown. Output ONLY the script sentences, one per line:`;
}

export function buildClaimSafeRewritePrompt(
  script: string,
  claims: string[],
): string {
  return `Rewrite this narration so it no longer states any of the unverified claims below. Keep the same topic, structure and approximate length. Do not add new numbers, dates, statistics, formulas, sources or facts. Replace a removed claim with a qualitative explanation or a concrete example already implied by the script.

UNVERIFIED CLAIMS:
${claims.map((claim) => `- ${claim}`).join('\n')}

SCRIPT:
${script}

Keep the rewritten script in the original language and writing system of the script above.
Return only the rewritten script, one sentence per line, with no markdown or commentary.`;
}

export function buildScriptSystemPrompt(): string {
  return 'You are an expert educational script writer. You create engaging, accurate, and educational video scripts in the language the user asks for. You write in a conversational, natural style. You always follow the structure: Hook → Introduction → Explanation → Application → Conclusion. You only use facts supplied in the content brief; when no verified fact is supplied you explain qualitatively instead of inventing numbers or sources. You output only the script text with no markdown, headings, or commentary.';
}
