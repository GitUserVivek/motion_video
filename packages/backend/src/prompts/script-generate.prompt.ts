export function buildScriptGeneratePrompt(
  topic: string,
  durationSeconds: number,
  language: string,
): string {
  const wordCount = Math.round(durationSeconds * 2.5);
  const sentenceCount = Math.max(4, Math.round(durationSeconds / 9));

  return `Write the spoken narration for a ${durationSeconds}-second educational video about: ${topic}

This narration is read aloud by a text-to-speech engine and cut into captions, so it has to sound like a person talking to the viewer — not like an encyclopedia entry or an article.

RULES:
- ${sentenceCount} to ${sentenceCount + 2} sentences, about ${wordCount} words in total.
- One sentence per line. Every sentence ends with a period, question mark or exclamation mark.
- Short, spoken sentences: 8-18 words each. No semicolons, no parenthetical asides, no long lists.
- First sentence is the hook: a direct question or a surprising fact about the topic.
- The middle sentences explain the idea step by step, in a logical order, using everyday words.
- Final sentence recaps the takeaway in one short line.
- Write the way people speak: contractions, commas for pauses, "because", "so", "imagine".
- Do NOT write headings, titles, bullet points, numbering, markdown, emoji, stage directions or notes.
- Do NOT begin with "In this video", "Welcome" or "Hello everyone" — start with the hook itself.
- Output ONLY the narration lines, nothing else.

Example of the exact style required:
Have you ever wondered why plants never seem to run out of food?
They make it themselves, using nothing but sunlight, water and air.
This process is called photosynthesis, and it happens inside the leaves.
Tiny structures called chloroplasts capture sunlight and turn water and carbon dioxide into sugar.
The plant releases oxygen as a by-product, which is the air we breathe.
So every meal you eat traces back to sunlight captured by a leaf.

Write the narration now (language: ${language}):`;
}

export function buildScriptSystemPrompt(): string {
  return 'You write spoken narration for short educational videos. You write short, punctuated sentences, one per line, in plain text with no markdown, headings, bullets or commentary. You output only the narration itself.';
}
