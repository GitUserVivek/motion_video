/**
 * Script-neutral text helpers.
 *
 * The pipeline was originally written for English and used `[^a-z0-9]` to
 * normalise and tokenise text. A Devanagari string normalised to `''`, so
 * duplicate titles, caption fragments and visual relevance could never be
 * detected in a Marathi video. Keep the language helpers here so every service
 * compares text the same way.
 */

export const DEVANAGARI_RE = /[\u0900-\u097F]/;

export function hasDevanagari(text: string): boolean {
  return DEVANAGARI_RE.test(text);
}

/** Words in any script, lower-cased and stripped of punctuation. */
export function unicodeTokens(text: string): string[] {
  return text
    .normalize('NFC')
    .toLowerCase()
    // \p{M} keeps Devanagari vowel signs (matras); they are combining marks,
    // not letters, so stripping them turns आहे into आह.
    .replace(/[^\p{L}\p{M}\p{N}%]+/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1);
}

/** Stable comparison key: punctuation and spacing do not matter. */
export function normalizeForComparison(text: string): string {
  return unicodeTokens(text).join(' ');
}

/**
 * Marathi concept words mapped to the English vocabulary the artwork library,
 * prompts and icon tables already use. This is deliberately a small, literal
 * map: it bridges the label to the asset pack, not a translation engine.
 */
const MARATHI_CONCEPTS: Array<[RegExp, string[]]> = [
  [/पान|पाने|पर्ण/, ['leaf', 'leaves']],
  [/वनस्पती|झाड|वृक्ष/, ['plant', 'tree']],
  [/सूर्यप्रकाश|सूर्य|प्रकाश/, ['sun', 'sunlight', 'light']],
  [/पाणी|पाण्याची|जल/, ['water']],
  [/कार्बन\s*डाइऑक्साइड|कार्बन\s*डायऑक्साइड|कार्बन/, ['carbon', 'dioxide']],
  [/ऑक्सिजन/, ['oxygen']],
  [/ग्लूकोज|ग्लुकोज/, ['glucose']],
  [/क्लोरोप्लास्ट/, ['chloroplast', 'cell']],
  [/पेशी/, ['cell']],
  [/वातावरण|हवा/, ['air', 'atmosphere']],
  [/ढग/, ['cloud']],
  [/माती|मृदा/, ['soil']],
  [/बीज|बिया/, ['seed']],
  [/मूळ/, ['root']],
  [/खोड/, ['stem']],
  [/फूल/, ['flower']],
  [/फळ/, ['fruit']],
  [/अन्न|भोजन/, ['food']],
  [/ऊर्जा/, ['energy']],
  [/प्रक्रिया/, ['process']],
  [/प्रयोग/, ['experiment']],
  [/सूक्ष्मदर्शक/, ['microscope']],
  [/हृदय/, ['heart']],
  [/रक्त/, ['blood']],
  [/मेंदू/, ['brain']],
  [/अणू/, ['atom']],
  [/रेणू/, ['molecule']],
  [/विद्युत|वीज/, ['electric', 'circuit']],
  [/ग्रह/, ['planet']],
  [/पृथ्वी/, ['earth', 'globe']],
  [/अवकाश/, ['space']],
  [/पुस्तक/, ['book']],
  [/गणित/, ['math']],
  [/समीकरण/, ['equation']],
  [/आलेख/, ['chart']],
  [/तापमान/, ['temperature']],
  [/वेग/, ['speed']],
  [/बल/, ['force']],
  [/गुरुत्व/, ['gravity']],
  // Geometry and maths. Without these, a Marathi diagram label such as
  // "त्रिकोण" or "कोन" carries no English token at all, so a diagram named
  // `LabeledTriangle.svg` can never be matched or verified for it and the tile
  // keeps its built-in glyph even when the right file is already downloaded.
  [/त्रिकोण/, ['triangle']],
  [/लंबकोन|काटकोन|समकोन/, ['angle', 'right']],
  [/कोन/, ['angle']],
  [/कर्ण|हिपोटेन्यूस|हायपोटेन्यूस/, ['hypotenuse']],
  [/पिथागोरस|पायथागोरस|पायथॅगोरस/, ['pythagorean', 'theorem']],
  [/बाजू/, ['side']],
  [/घन/, ['cube']],
  [/चौरस/, ['square']],
  [/आयत/, ['rectangle']],
  [/वर्तुळ/, ['circle']],
];

/** English tokens plus the Marathi concepts named in the text. */
export function mappedTokens(text: string): string[] {
  const tokens = unicodeTokens(text);
  const mapped: string[] = [];
  for (const [pattern, words] of MARATHI_CONCEPTS) {
    if (pattern.test(text)) mapped.push(...words);
  }
  return [...new Set([...tokens, ...mapped])];
}

/**
 * First concrete object named by a Marathi label. Returns the renderer/library
 * object id, or null when the label names no concrete object.
 */
const MARATHI_OBJECTS: Array<[string, RegExp]> = [
  ['leaf', /पान|पाने|पर्ण/],
  ['plant', /वनस्पती|झाड|वृक्ष/],
  ['sun', /सूर्यप्रकाश|सूर्य/],
  ['water', /पाणी|जल/],
  ['cloud', /ढग|वातावरण/],
  ['cell', /पेशी|क्लोरोप्लास्ट/],
  ['atom', /अणू|रेणू/],
  ['heart', /हृदय/],
  ['brain', /मेंदू/],
  ['microscope', /सूक्ष्मदर्शक/],
  ['rocket', /अवकाश|रॉकेट/],
  ['globe', /पृथ्वी|ग्रह/],
  ['book', /पुस्तक/],
  ['calculator', /गणित|समीकरण/],
  ['timeline', /कालरेषा/],
  ['chart', /आलेख/],
];

export function marathiObjectType(text: string): string | null {
  for (const [type, pattern] of MARATHI_OBJECTS) {
    if (pattern.test(text)) return type;
  }
  return null;
}

/**
 * Correct frequent on-screen Marathi wording mistakes without touching the
 * narration. These are label-level fixes the model keeps producing even when
 * the narration itself is grammatical.
 */
export function fixMarathiWording(text: string): string {
  return text
    .replace(/सूर्याचे प्रकाश शोषण/g, 'सूर्यप्रकाशाचे शोषण')
    .replace(/सूर्याचे प्रकाश/g, 'सूर्यप्रकाश')
    .replace(/पाणी वाहतुकी/g, 'पाण्याची वाहतूक')
    .replace(/पाणी वाहतूक/g, 'पाण्याची वाहतूक')
    .replace(/कार्बन डाइऑक्साइड/g, 'कार्बन डायऑक्साइड')
    .replace(/ग्लुकोज/g, 'ग्लूकोज');
}
