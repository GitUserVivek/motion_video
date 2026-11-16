export function buildScriptGeneratePrompt(topic: string, durationSeconds: number, language: string): string {
  const wordCount = Math.round(durationSeconds * 2.5);
  return `You are an expert educational content creator. Write a clear, engaging narration script for a short educational video.

TOPIC: ${topic}
TARGET DURATION: ${durationSeconds} seconds
TARGET WORD COUNT: approximately ${wordCount} words
LANGUAGE: ${language}

REQUIREMENTS:
- Write in a friendly, conversational tone suitable for learners of all ages
- Structure: brief introduction, 2-3 key points, clear conclusion
- Each sentence should be short and easy to follow
- Avoid jargon unless absolutely necessary; always explain technical terms
- Do NOT include stage directions, scene descriptions, or formatting markup
- Output ONLY the narration text — no title, no headers, no bullet points
- The script will be read aloud by a text-to-speech engine, so write naturally spoken sentences

Write the script now:`;
}

export function buildScriptSystemPrompt(): string {
  return 'You are an expert educational video scriptwriter. You write clear, accurate, engaging narration scripts for short educational videos. You output only plain narration text with no formatting.';
}
