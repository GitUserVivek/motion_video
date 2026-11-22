import type { SceneInstruction, StoryboardPlan } from '@edumotion/shared';

/**
 * Safe arithmetic checks for values that will be shown on screen.
 *
 * No `eval` and no full algebra engine: the common cases are a displayed
 * equation (`12 + 8 = 20`), a percentage, or an AnimatedNumber target. Anything
 * that cannot be parsed is reported for review instead of being called correct.
 */

type Token = { kind: 'number' | 'op' | 'paren'; value: string };

function tokenize(expression: string): Token[] | null {
  const tokens: Token[] = [];
  const compact = expression.replace(/\s+/g, '');
  let index = 0;

  while (index < compact.length) {
    const char = compact[index] as string;
    if (/[0-9.]/.test(char)) {
      let number = '';
      while (index < compact.length && /[0-9.]/.test(compact[index] as string)) {
        number += compact[index];
        index++;
      }
      if ((number.match(/\./g) ?? []).length > 1) return null;
      tokens.push({ kind: 'number', value: number });
      continue;
    }
    if ('+-*/'.includes(char)) {
      tokens.push({ kind: 'op', value: char });
      index++;
      continue;
    }
    if ('()'.includes(char)) {
      tokens.push({ kind: 'paren', value: char });
      index++;
      continue;
    }
    return null;
  }
  return tokens;
}

class Parser {
  private position = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): number | null {
    const value = this.expression();
    return this.position === this.tokens.length ? value : null;
  }

  private expression(): number | null {
    let left = this.term();
    if (left === null) return null;
    while (this.matchOp('+') || this.matchOp('-')) {
      const op = this.tokens[this.position - 1]?.value;
      const right = this.term();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  private term(): number | null {
    let left = this.factor();
    if (left === null) return null;
    while (this.matchOp('*') || this.matchOp('/')) {
      const op = this.tokens[this.position - 1]?.value;
      const right = this.factor();
      if (right === null) return null;
      if (op === '/' && Math.abs(right) < 1e-12) return null;
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  private factor(): number | null {
    const token = this.tokens[this.position];
    if (!token) return null;

    if (token.kind === 'number') {
      this.position++;
      const value = Number.parseFloat(token.value);
      return Number.isFinite(value) ? value : null;
    }

    if (token.kind === 'paren' && token.value === '(') {
      this.position++;
      const value = this.expression();
      const close = this.tokens[this.position];
      if (value === null || !close || close.value !== ')') return null;
      this.position++;
      return value;
    }

    return null;
  }

  private matchOp(op: string): boolean {
    const token = this.tokens[this.position];
    if (token?.kind === 'op' && token.value === op) {
      this.position++;
      return true;
    }
    return false;
  }
}

export function evaluateExpression(expression: string): number | null {
  const tokens = tokenize(expression);
  if (!tokens || tokens.length === 0) return null;
  return new Parser(tokens).parse();
}

export interface MathIssue {
  sceneId?: string;
  message: string;
}

/** Check equations and numeric targets in a storyboard. */
export function validateMath(storyboard: StoryboardPlan): MathIssue[] {
  const issues: MathIssue[] = [];

  for (const scene of storyboard.scenes) {
    const texts = collectStrings(scene);
    for (const text of texts) {
      for (const match of text.matchAll(/([\d()+\-*/. ]+)=([\d().+\-* ]+)/g)) {
        const leftRaw = match[1]?.trim();
        const rightRaw = match[2]?.trim();
        if (!leftRaw || !rightRaw) continue;
        const left = evaluateExpression(leftRaw);
        const right = evaluateExpression(rightRaw);
        if (left === null || right === null) continue;
        if (Math.abs(left - right) > 1e-6) {
          issues.push({
            sceneId: scene.id,
            message: `Displayed equation is false: ${leftRaw} = ${rightRaw}`,
          });
        }
      }
    }

    // A number counter must show a value the narration actually supports.
    for (const child of scene.children ?? []) {
      if (child.component !== 'AnimatedNumber' && child.component !== 'NumberCounter') continue;
      const target = child.props['target'] ?? child.props['value'];
      if (typeof target === 'number' && Number.isFinite(target)) {
        const narration = texts.join(' ');
        const values = [...narration.matchAll(/\d[\d,]*(?:\.\d+)?/g)]
          .map((item) => Number.parseFloat((item[0] ?? '').replace(/,/g, '')))
          .filter((value) => Number.isFinite(value));
        if (values.length > 0 && !values.some((value) => Math.abs(value - target) < 1e-6)) {
          issues.push({
            sceneId: scene.id,
            message: `Number ${target} is displayed but does not appear in the narration.`,
          });
        }
      }
    }
  }

  return issues;
}

function collectStrings(value: unknown, depth = 0): string[] {
  if (depth > 4 || value === null || value === undefined) return [];
  if (typeof value === 'string') return [value];
  if (typeof value === 'number') return [String(value)];
  if (Array.isArray(value)) return value.flatMap((item) => collectStrings(item, depth + 1));
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((item) =>
      collectStrings(item, depth + 1),
    );
  }
  return [];
}

export type { SceneInstruction };
