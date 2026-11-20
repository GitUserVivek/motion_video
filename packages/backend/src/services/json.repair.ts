/**
 * Salvage JSON from a local-model reply.
 *
 * A 7B instruct model drifts from strict JSON in predictable ways: it drops the
 * comma between two array elements (`[{..} {..}]`) or between two properties
 * (`{"a": 1 "b": 2}`), leaves a trailing comma, wraps the object in markdown
 * fences, uses single quotes or forgets to quote keys at all, and sometimes
 * stops mid-object when it hits the token limit.
 *
 * Throwing the whole generation away costs a second LLM round trip (and, at the
 * worker level, a repeated TTS pass), so the common defects are repaired here
 * before giving up.
 */
export function parseLooseJson<T = unknown>(raw: string): T {
  const slice = extractJsonSlice(stripFences(raw));

  try {
    return JSON.parse(slice) as T;
  } catch {
    /* fall through to the repair pass */
  }

  const repaired = repairJson(slice);
  try {
    return JSON.parse(repaired) as T;
  } catch (err) {
    const snippet = slice.slice(0, 240).replace(/\s+/g, ' ');
    throw new SyntaxError(`${(err as Error).message} | start: ${snippet}`);
  }
}

/** Drop ```json fences without touching the content between them. */
function stripFences(text: string): string {
  return text.replace(/```[a-zA-Z]*\s*/g, '').replace(/```/g, '');
}

/**
 * Cut out the first balanced {...} or [...] block. Prose before/after the object
 * is common ("Here is the storyboard:") and makes JSON.parse fail.
 */
function extractJsonSlice(text: string): string {
  const firstObject = text.indexOf('{');
  const firstArray = text.indexOf('[');

  let start = -1;
  if (firstObject === -1) start = firstArray;
  else if (firstArray === -1) start = firstObject;
  else start = Math.min(firstObject, firstArray);
  if (start === -1) return text.trim();

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  // Unbalanced: the model was cut off. Keep everything and let repairJson close
  // the open containers.
  return text.slice(start);
}

/**
 * Rewrite the slice into parseable JSON by walking it as a token stream:
 * inserts missing commas, converts single-quoted strings and unquoted keys to
 * the double-quoted form, drops trailing commas and closes truncated containers.
 */
export function repairJson(source: string): string {
  const stack: Array<'{' | '['> = [];
  let out = '';
  let needsComma = false;
  let expectKey = false;
  let inString = false;
  let quote = '"';
  let escaped = false;

  const top = (): '{' | '[' | undefined => stack[stack.length - 1];

  const peek = (from: number): string => {
    for (let j = from; j < source.length; j++) {
      const c = source[j];
      if (c !== undefined && !/\s/.test(c)) return c;
    }
    return '';
  };

  let i = 0;
  while (i < source.length) {
    const ch = source[i] as string;

    if (inString) {
      if (escaped) {
        // \' is valid inside a single-quoted literal but never in JSON, so the backslash is dropped.
        out = ch === "'" ? out.slice(0, -1) + ch : out + ch;
        escaped = false;
      } else if (ch === '\\') {
        out += ch;
        escaped = true;
      } else if (ch === quote) {
        out += quote === "'" ? '"' : ch;
        inString = false;
        // A string in an object followed by ':' is a key; anything else is a value.
        if (top() === '{' && peek(i + 1) === ':') {
          needsComma = false;
          expectKey = false;
        } else {
          needsComma = true;
          expectKey = false;
        }
      } else {
        // Inside a single-quoted string every double quote must be escaped.
        out += quote === "'" && ch === '"' ? '\\"' : ch;
      }
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      if (needsComma) {
        out += ',';
        needsComma = false;
      }
      quote = ch;
      inString = true;
      escaped = false;
      out += ch === "'" ? '"' : ch;
      i++;
      continue;
    }

    if (/\s/.test(ch)) {
      out += ch;
      i++;
      continue;
    }

    if (ch === '{' || ch === '[') {
      if (needsComma) {
        out += ',';
        needsComma = false;
      }
      out += ch;
      stack.push(ch);
      expectKey = ch === '{';
      needsComma = false;
      i++;
      continue;
    }

    if (ch === '}' || ch === ']') {
      out += ch;
      stack.pop();
      needsComma = true;
      expectKey = false;
      i++;
      continue;
    }

    if (ch === ',') {
      out += ch;
      needsComma = false;
      expectKey = top() === '{';
      i++;
      continue;
    }

    if (ch === ':') {
      out += ch;
      needsComma = false;
      expectKey = false;
      i++;
      continue;
    }

    // Unquoted key: {type: "leaf"} → {"type": "leaf"}
    if (expectKey && top() === '{' && /[A-Za-z_$]/.test(ch)) {
      let word = '';
      while (i < source.length && /[A-Za-z0-9_$]/.test(source[i] as string)) {
        word += source[i];
        i++;
      }
      if (needsComma) {
        out += ',';
        needsComma = false;
      }
      out += `"${word}"`;
      expectKey = false;
      continue;
    }

    // Numbers and the literals true/false/null.
    if (/[0-9+\-.A-Za-z]/.test(ch)) {
      if (needsComma) {
        out += ',';
        needsComma = false;
      }
      let word = '';
      while (i < source.length && /[0-9eE+\-.A-Za-z]/.test(source[i] as string)) {
        word += source[i];
        i++;
      }
      out += word;
      needsComma = true;
      expectKey = false;
      continue;
    }

    // Anything else (stray characters) is dropped rather than breaking the parse.
    i++;
  }

  let tail = out.replace(/\s+$/, '');

  if (inString) tail += '"';
  // A dangling separator before a closer is invalid JSON.
  while (/[,:]\s*$/.test(tail)) tail = tail.replace(/[,:]\s*$/, '');

  // Close whatever the model never closed, innermost first.
  for (let k = stack.length - 1; k >= 0; k--) {
    tail += stack[k] === '{' ? '}' : ']';
  }

  return tail.replace(/,(\s*[}\]])/g, '$1');
}
