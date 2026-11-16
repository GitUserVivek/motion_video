export function buildScriptValidatePrompt(content: string): string {
  return `Review the following educational video script. Check for:
1. Grammar and spelling errors
2. Unclear or confusing sentences
3. Sentences that are too long for text-to-speech (over 25 words)
4. Any inappropriate content

If the script is acceptable as-is, return it UNCHANGED.
If it needs minor fixes, return the corrected version.
Output ONLY the script text — no commentary, no explanations.

SCRIPT:
${content}`;
}

export function buildValidateSystemPrompt(): string {
  return 'You are a professional script editor. You review educational video scripts and fix grammar, clarity, and readability issues. You output only the corrected script text with no commentary.';
}
