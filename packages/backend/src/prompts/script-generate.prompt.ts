export function buildScriptGeneratePrompt(
  topic: string,
  durationSeconds: number,
  language: string,
): string {
  const wordCount = Math.round(durationSeconds * 2.5);
  const sentenceCount = Math.max(6, Math.round(durationSeconds / 7));

  return `You are an expert educational content creator. Write a professional, engaging educational script for a ${durationSeconds}-second explainer video about: ${topic}

STRUCTURE REQUIREMENTS (MANDATORY):
1. HOOK (First 1-2 sentences): Start with a surprising fact, thought-provoking question, common misconception, or relatable situation to grab attention and create curiosity.
2. INTRODUCTION (Next 1-2 sentences): Introduce the main concept and why it matters. Explain what we'll learn.
3. MAIN EXPLANATION (Middle sentences): Break down the concept progressively from simple to complex. Use the following techniques:
   - Explain WHY things happen, not just WHAT happens
   - Use real-world examples and analogies
   - Include interesting facts, comparisons, and statistics
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
- Include at least ONE analogy or real-world example
- Include at least ONE interesting fact or surprising statistic
- Include at least ONE "why" or "how" explanation
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

EXAMPLE OF THE EXACT STYLE REQUIRED (for topic "photosynthesis"):
Why do plants never seem to run out of food?
They make it themselves using a process called photosynthesis.
Imagine a tiny factory inside each leaf, capturing sunlight and turning it into energy.
Using just sunlight, water, and carbon dioxide, plants create sugar to feed themselves.
This happens in special structures called chloroplasts that contain a green pigment called chlorophyll.
As a byproduct, plants release oxygen into the air — the very oxygen we breathe.
Without photosynthesis, life on Earth as we know it wouldn't exist.
So every meal you eat traces back to sunlight captured by a leaf.

ANOTHER EXAMPLE (for topic "how bones work"):
What's holding you up right now?
Your skeleton — a remarkable framework of 206 bones that gives your body structure and protection.
Bones aren't just rigid sticks; they're living tissue that constantly repairs and strengthens itself.
Your femur, or thigh bone, is the strongest bone in your body and can support 30 times your body weight.
But tiny bones like the stapes in your ear are just 2.8 millimeters long — about the size of a grain of rice.
Bones also protect your vital organs: your rib cage shields your heart and lungs, while your skull protects your brain.
Without bones, you couldn't stand, walk, or even breathe properly.
So the next time you move, remember it's your amazing skeleton making it all possible.

Write the script now (language: ${language}). DO NOT add any explanation, commentary, or markdown. Output ONLY the script sentences, one per line:`;
}

export function buildScriptSystemPrompt(): string {
  return 'You are an expert educational script writer. You create engaging, accurate, and educational video scripts. You write in a conversational, natural style. You always follow the structure: Hook → Introduction → Explanation → Application → Conclusion. You output only the script text with no markdown, headings, or commentary.';
}
