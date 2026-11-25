/**
 * Devanagari scripts need their own checklist: the model's usual Marathi
 * failure is not a typo but English word order, wrong verb agreement and
 * invented words, and a generic "check grammar" line never catches those.
 */
const MARATHI_CHECKLIST = `
MARATHI CHECKLIST — a sentence is wrong if any answer is "no":
- Does the verb agree with its subject (वनस्पती ... करतात, पान ... करते, पाणी ... वाहते)?
- Is every word a real, correctly spelt Marathi word, or a familiar technical term written in Devanagari? Replace invented words (उदा. पालंड) with the standard Marathi or English-in-Devanagari term.
- Is this a Marathi sentence, or an English sentence translated word for word? Rewrite literal calques as a Marathi teacher would say them.
- Does the clause put its verb at the end, with correct case endings (पानांमध्ये, पानांवर, वनस्पतींचे)?
- Are numbers written as Marathi words, and does every sentence end with ।, ? or ! followed by a space?
Rewrite a broken sentence correctly instead of keeping it.
`;

export function buildScriptValidatePrompt(content: string): string {
  const marathi = /[\u0900-\u097F]/.test(content);
  return `Review the following educational video script. Check for:
1. Grammar and spelling errors
2. Unclear or confusing sentences
3. Sentences that are too long for text-to-speech (over 25 words)
4. Any inappropriate content
${marathi ? MARATHI_CHECKLIST : ''}
If the script is acceptable as-is, return it UNCHANGED.
If it needs fixes, return the corrected version in the same language and writing system as the original.
Output ONLY the script text — no commentary, no explanations.

SCRIPT:
${content}`;
}

export function buildValidateSystemPrompt(): string {
  return 'You are a professional script editor. You review educational video scripts and fix grammar, clarity, and readability issues. You output only the corrected script text with no commentary.';
}
