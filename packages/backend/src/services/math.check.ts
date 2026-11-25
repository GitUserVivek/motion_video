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

const CHEMICAL_ARROW = /(?:->|→|=>)/;
const REACTION_CONDITIONS = /^(?:light|sunlight|chlorophyll|heat|energy|catalyst|electricity|hv)$/i;

/** Element symbols, so `ATP`/`Pi` are not mistaken for a balanceable formula. */
const ELEMENTS = new Set<string>(
  'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr ' +
  'Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu ' +
  'Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr ' +
  'Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'.split(' '),
);

/** A word such as `glucose` is not a formula; the equation cannot be trusted. */
function containsWordTerm(side: string): boolean {
  for (const raw of side.split('+')) {
    let term = raw.trim().replace(/\s+/g, '');
    if (!term || REACTION_CONDITIONS.test(term)) continue;
    term = term.replace(/(?:\((?:aq|s|l|g)\))$/i, '');
    const coefficient = term.match(/^(\d+(?:\.\d+)?)/)?.[1];
    const formula = coefficient ? term.slice(coefficient.length) : term;
    if (/[a-z]{2,}/.test(formula.replace(/[A-Z][a-z]?/g, ''))) return true;
  }
  return false;
}

/** Count each element in one side of a chemical equation. */
function elementCounts(side: string): Map<string, number> | null {
  const counts = new Map<string, number>();

  const add = (element: string, amount: number): void => {
    counts.set(element, (counts.get(element) ?? 0) + amount);
  };

  const parseGroup = (text: string, start: number): { at: number; parsed: Map<string, number> } | null => {
    const parsed = new Map<string, number>();
    let index = start;

    while (index < text.length && text[index] !== ')') {
      const char = text[index] as string;
      if (char === '(') {
        const nested = parseGroup(text, index + 1);
        if (!nested) return null;
        let multiplier = 1;
        let cursor = nested.at;
        if (text[cursor] === ')') cursor++;
        const digits = text.slice(cursor).match(/^\d+/)?.[0];
        if (digits) {
          multiplier = Number(digits);
          cursor += digits.length;
        }
        for (const [element, amount] of nested.parsed) {
          parsed.set(element, (parsed.get(element) ?? 0) + amount * multiplier);
        }
        index = cursor;
        continue;
      }
      if (!/[A-Z]/.test(char)) return null;

      let element = char;
      index++;
      if (index < text.length && /[a-z]/.test(text[index] as string)) {
        element += text[index];
        index++;
      }
      if (!ELEMENTS.has(element)) return null;
      const digits = text.slice(index).match(/^\d+/)?.[0];
      const amount = digits ? Number(digits) : 1;
      if (digits) index += digits.length;
      parsed.set(element, (parsed.get(element) ?? 0) + amount);
    }

    return { at: index, parsed };
  };

  for (const raw of side.split('+')) {
    let term = raw.trim().replace(/\s+/g, '');
    if (!term) return null;
    if (REACTION_CONDITIONS.test(term)) continue;
    // State symbols are not part of the element count.
    term = term.replace(/(?:\((?:aq|s|l|g)\))$/i, '');
    const coefficient = term.match(/^(\d+(?:\.\d+)?)/)?.[1];
    const coefficientValue = coefficient ? Number(coefficient) : 1;
    const formula = coefficient ? term.slice(coefficient.length) : term;
    if (!formula) return null;

    // `glucose`, `sugar` and other words are not formulas; an equation that
    // mixes them with symbols cannot be checked and should not be shown as fact.
    if (/[a-z]{2,}/.test(formula.replace(/[A-Z][a-z]?/g, ''))) return null;

    const parsed = parseGroup(formula, 0);
    if (!parsed || parsed.at !== formula.length || parsed.parsed.size === 0) return null;
    for (const [element, amount] of parsed.parsed) {
      add(element, amount * coefficientValue);
    }
  }

  return counts.size > 0 ? counts : null;
}

/**
 * True when a chemical equation is balanced, false when it is demonstrably
 * wrong, null when the string is not a chemical equation we can parse.
 */
export function isBalancedChemicalEquation(equation: string): boolean | null {
  if (!CHEMICAL_ARROW.test(equation)) return null;
  const sides = equation.split(CHEMICAL_ARROW);
  if (sides.length !== 2) return false;
  if (containsWordTerm(sides[0] ?? '') || containsWordTerm(sides[1] ?? '')) return false;
  const left = elementCounts(sides[0] ?? '');
  const right = elementCounts(sides[1] ?? '');
  // Unparseable symbols (e.g. a captioned reaction notation) are not a proven
  // error, so they are left to the math/equation checks instead of blocking.
  if (!left || !right) return null;
  if (left.size !== right.size) return false;
  for (const [element, amount] of left) {
    if (right.get(element) !== amount) return false;
  }
  return true;
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
      if (isBalancedChemicalEquation(text) === false) {
        issues.push({
          sceneId: scene.id,
          message: `Displayed chemical equation is not balanced: ${text}`,
        });
      }
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
