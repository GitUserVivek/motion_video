import { languageName, normalizeLanguage, type ContentAnalysis } from '@edumotion/shared';
import { formatContentAnalysisForScript } from './content-analysis.prompt.js';

/**
 * The narration language is a hard requirement, not a hint. A small local model
 * happily ignores "language: mr" and answers in English, and when it does write
 * Devanagari it translates the English prompt word for word, which produces
 * sentences such as "पानांवर तुमच्यासाठी अंधार नसलेले असताना" and invented words
 * such as "पालंड". So a Marathi run gets a real writing guide: grammar and
 * agreement rules, vocabulary rules, an example of the required prose, and a
 * self-check, placed before the generic English style instructions.
 */
export function languageRules(language: string): string {
  if (normalizeLanguage(language) === 'mr') {
    return `LANGUAGE (MANDATORY): Write the entire narration in Marathi (मराठी) using Devanagari script. Never write the narration in English and never transliterate Marathi into Latin letters. The structure and content rules below still apply; the English style habits do not.

MARATHI WRITING GUIDE — follow every rule here:

1. COMPOSE IN MARATHI, DO NOT TRANSLATE
- The content brief below may be in English. Take only its facts and ideas, then write original Marathi sentences for a Maharashtra school student.
- Never translate an English sentence word for word. Say it the way a Marathi teacher would say it out loud, even when the Marathi sentence uses completely different words.
- Do not build phrases by stacking Marathi words in English order. The verb belongs at the end of the clause: "वनस्पती सूर्यप्रकाशाच्या मदतीने अन्न तयार करते", not "वनस्पती तयार करते अन्न सूर्यप्रकाशाच्या मदतीने".
- Do not invent Marathi words. If you do not know the standard Marathi word for a scientific term, use the familiar English term written in Devanagari (क्लोरोफिल, क्लोरोप्लास्ट, कार्बन डायऑक्साइड, ऑक्सिजन) or the everyday Marathi word (पान, मूळ, अन्न, हवा, पाणी).

2. GRAMMAR
- Match every verb to its subject: वनस्पती ... तयार करतात (plural), पान ... तयार करते (neuter singular), पाणी ... वाहते (neuter singular), मुळे ... शोषून घेतात (plural). Do not use a plural verb with a singular subject or the reverse.
- Use correct case endings and do not guess them: पानांमध्ये (inside the leaves), पानांवर (on the leaves), पानांद्वारे (through the leaves), वनस्पतीला (to the plant), वनस्पतींचे (of the plants).
- Keep pronouns consistent with the noun they replace: पान is neuter (ते), वनस्पती is feminine (ती), रेणू is masculine (तो).
- Many abstract nouns are feminine and take ही/ती: ही प्रक्रिया, ही पद्धत, ही ऊर्जा, ही अवस्था, ही रचना. Never write "हे प्रक्रिया" or "ते पद्धत".
- Use standard school-textbook Marathi, the language of a Maharashtra state-board lesson, not heavy Sanskritised prose and not Hindi.

3. SPOKEN STYLE
- Address the viewer as तुम्ही and use आपण for "we"/"you and I". Pick one form for the whole script and keep it.
- Use short spoken sentences of 8-16 words.
- Use Marathi connectors instead of English ones: कारण (because), म्हणजे (that means), उदाहरणार्थ (for example), त्यामुळे (therefore), म्हणून (so), कल्पना करा (imagine), पण (but), आणि (and).
- Avoid English words where a common Marathi word exists; keep only technical terms that Marathi speakers actually use in English.

4. PUNCTUATION AND NUMBERS
- End every sentence with the danda (।), or with ? or ! for questions and exclamations, and put a space after it.
- Write numbers as spoken Marathi words (दोन, तीन, दहा), never as digits.

5. SELF-CHECK BEFORE ANSWERING
Read every sentence back once and fix it if any answer is "no":
- Does the verb agree with its subject?
- Is every word a real, correctly spelt Marathi word?
- Would a Marathi teacher say this exact sentence out loud?
- Is it a Marathi sentence, or an English sentence with Marathi words in it?

EXAMPLE OF THE REQUIRED GRAMMAR AND TONE (the topic is पाण्याच्या तीन अवस्था — copy the grammar and the spoken tone, never this content):
बर्फ वितळल्यावर पाणी होते, हे तुम्ही पाहिले असेल; पण तेच पाणी वाफेत का बदलते?
आपल्याभोवतीचे पाणी तापमानानुसार तीन अवस्थांमध्ये राहू शकते.
थंडीत ते बर्फासारखे घट्ट होते, साध्या तापमानात द्रव राहते, आणि उकळल्यावर वाफ होऊन हवेत मिसळते.
कारण तापमान वाढल्यावर पाण्याच्या रेणूंना एकमेकांना जवळ ठेवणारे बल कमकुवत होते.
उदाहरणार्थ, ग्लासमधील बर्फ वितळताना त्याचे रेणू सुटतात आणि पाणी वाहू लागते.
म्हणूनच पाण्याची अवस्था ठरवणारा खरा घटक म्हणजे तापमान.`;
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

${languageRules(language)}

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

Keep the rewritten script in the original language and writing system of the script above.${/[\u0900-\u097F]/.test(script) ? '\nWrite natural Marathi: match verbs to subjects, put the verb at the end of the clause, never translate English word for word, never invent a Marathi word, and end each sentence with ।, ? or !. Numbers are Marathi words, not digits.' : ''}
Return only the rewritten script, one sentence per line, with no markdown or commentary.`;
}

export function buildScriptSystemPrompt(): string {
  return 'You are an expert educational script writer. You create engaging, accurate, and educational video scripts in the language the user asks for. You write in a conversational, natural style. You always follow the structure: Hook → Introduction → Explanation → Application → Conclusion. You only use facts supplied in the content brief; when no verified fact is supplied you explain qualitatively instead of inventing numbers or sources. You output only the script text with no markdown, headings, or commentary.';
}
