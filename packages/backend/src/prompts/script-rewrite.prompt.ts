export function buildScriptRewritePrompt(content: string, mode: 'improve' | 'preserve'): string {
  if (mode === 'preserve') {
    return `Review the following script and fix ONLY grammar, punctuation, and spelling errors.
Do NOT change the meaning, structure, or voice of the script.
Keep the script in its original language and writing system (Marathi stays Marathi in Devanagari).
Output ONLY the corrected script text with no commentary.

SCRIPT:
${content}`;
  }

  return `Rewrite the following educational video script to improve its:
- Clarity and flow
- Educational engagement
- Sentence structure for text-to-speech readability
- Overall quality

Keep the same topic and key information. Maintain approximately the same length.
Keep the script in its original language and writing system (Marathi stays Marathi in Devanagari).
Output ONLY the rewritten script text with no commentary.

ORIGINAL SCRIPT:
${content}`;
}

export function buildRewriteSystemPrompt(): string {
  return 'You are a professional educational content editor. You improve scripts for clarity, engagement, and TTS readability without translating them out of their original language. You output only the revised script with no extra commentary.';
}
