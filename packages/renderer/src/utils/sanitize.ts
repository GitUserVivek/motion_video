import type { ComponentName, SubtitleEntry } from '@edumotion/shared';

/**
 * A storyboard comes from a 7B model, so any prop can be the wrong type: a
 * string where an array is expected, an object where a string is expected, a
 * number as a title. Components index these values directly, which turned a bad
 * prop into a thrown TypeError that killed a 90-second render.
 *
 * Every prop is therefore checked once, here, right before it reaches a
 * component. Returning null means "this child cannot be rendered meaningfully"
 * and it is skipped instead of crashing the composition.
 */

type Props = Record<string, unknown>;

const OBJECT_TYPES = new Set<string>([
  'book', 'apple', 'globe', 'atom', 'lightbulb', 'calculator', 'pencil', 'star',
  'leaf', 'plant', 'sun', 'water', 'cloud', 'rocket', 'heart', 'cell', 'microscope',
]);
const OBJECT_ANIMATIONS = new Set(['fadeIn', 'bounce', 'none']);
const CHARACTER_STATES = new Set(['idle', 'wave', 'point', 'thinking']);
const THEMES = new Set(['educational', 'modern', 'playful', 'minimal']);
const PATTERNS = new Set(['none', 'dots', 'grid', 'waves']);
const ALIGNMENTS = new Set(['left', 'center', 'right']);

function isRecord(value: unknown): value is Props {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Coerce to a finite number inside [min, max]; anything unusable yields fallback. */
function num(value: unknown, fallback: number, min = -1e9, max = 1e9): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

/** Coerce to a string (numbers are allowed); objects/arrays fall back. */
function str(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function enumValue(value: unknown, allowed: Set<string>, fallback: string): string {
  return typeof value === 'string' && allowed.has(value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function subtitleEntries(value: unknown): SubtitleEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((entry, i) => ({
      index: Math.round(num(entry['index'], i, 0, 1e6)),
      startMs: num(entry['startMs'], 0, 0, 1e9),
      endMs: num(entry['endMs'], 0, 0, 1e9),
      text: str(entry['text'], ''),
    }))
    .filter((entry) => entry.text.length > 0 && entry.endMs >= entry.startMs);
}

function stringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const list = value.map((item) => str(item, '')).filter((item) => item.length > 0);
  return list.length > 0 ? list : fallback;
}

export function sanitizeProps(component: ComponentName, raw: Props): Props | null {
  switch (component) {
    case 'AnimatedText': {
      const value = str(raw['text'], '').trim();
      if (!value) return null;
      return {
        ...raw,
        text: value,
        fontSize: num(raw['fontSize'], 60, 12, 220),
        animationDuration: num(raw['animationDuration'], 20, 1, 120),
        textAlign: enumValue(raw['textAlign'], ALIGNMENTS, 'center'),
        lineHeight: num(raw['lineHeight'], 1.3, 0.8, 2.2),
      };
    }

    case 'AnimatedNumber': {
      const target = num(raw['target'], Number.NaN);
      if (!Number.isFinite(target)) return null;
      return {
        ...raw,
        target,
        duration: num(raw['duration'], 60, 1, 600),
        fontSize: num(raw['fontSize'], 120, 20, 420),
        prefix: str(raw['prefix'], ''),
        suffix: str(raw['suffix'], ''),
      };
    }

    case 'EducationalObject':
      return {
        ...raw,
        type: enumValue(raw['type'], OBJECT_TYPES, 'book'),
        size: num(raw['size'], 100, 40, 700),
        animation: enumValue(raw['animation'], OBJECT_ANIMATIONS, 'bounce'),
      };

    case 'ObjectGroup': {
      const items = Array.isArray(raw['items'])
        ? raw['items'].filter(isRecord).map((item) => ({
            ...item,
            type: enumValue(item['type'], OBJECT_TYPES, 'book'),
            size: num(item['size'], 100, 20, 700),
            startFrame: num(item['startFrame'], 0, 0, 1e6),
          }))
        : [];
      if (items.length === 0) return null;
      return {
        ...raw,
        items,
        layout: enumValue(raw['layout'], new Set(['row', 'grid', 'circle']), 'row'),
        spacing: num(raw['spacing'], 120, 30, 600),
      };
    }

    case 'MultiplicationTable':
      return {
        ...raw,
        multiplier: Math.round(num(raw['multiplier'], 5, 1, 1000)),
        rows: Math.round(num(raw['rows'], 10, 1, 30)),
        revealInterval: Math.max(1, Math.round(num(raw['revealInterval'], 6, 1, 120))),
        cellSize: num(raw['cellSize'], 80, 24, 260),
      };

    case 'ImageScene': {
      // No raster assets ship with the pipeline and the render box has no image
      // service, so only embedded data URLs are renderable. Anything else (a
      // model-invented http URL) would hang the render on a failed download.
      const src = str(raw['src'], '');
      if (!/^data:image\//i.test(src)) return null;
      return {
        ...raw,
        src,
        opacity: num(raw['opacity'], 1, 0, 1),
      };
    }

    case 'Subtitle':
      return { ...raw, entries: subtitleEntries(raw['entries']) };

    case 'QuestionCard': {
      const question = str(raw['question'], '').trim();
      if (!question) return null;
      return {
        ...raw,
        question,
        options: stringList(raw['options'], []),
        answer: str(raw['answer'], ''),
        revealAnswer: bool(raw['revealAnswer'], false),
      };
    }

    case 'Confetti':
      return {
        ...raw,
        count: Math.round(num(raw['count'], 40, 0, 300)),
        colors: stringList(raw['colors'], ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1']),
      };

    case 'EndScreen':
      return {
        ...raw,
        title: str(raw['title'], 'Thanks for Watching!'),
        subtitle: str(raw['subtitle'], 'Subscribe for more educational videos'),
        logoText: str(raw['logoText'], 'EduMotion'),
        showConfetti: bool(raw['showConfetti'], false),
      };

    case 'ProgressBar':
      return {
        ...raw,
        totalFrames: Math.max(1, Math.round(num(raw['totalFrames'], 600, 1, 1e6))),
        height: num(raw['height'], 8, 2, 80),
        showPercentage: bool(raw['showPercentage'], false),
      };

    case 'Character':
    case 'Teacher':
      return {
        ...raw,
        state: enumValue(raw['state'], CHARACTER_STATES, 'idle'),
        size: num(raw['size'], 200, 60, 700),
        flipX: bool(raw['flipX'], false),
      };

    case 'BackgroundScene': {
      const next: Props = {
        ...raw,
        theme: enumValue(raw['theme'], THEMES, 'educational'),
        pattern: enumValue(raw['pattern'], PATTERNS, 'none'),
      };
      // A gradient/color prop that is an object renders as "[object Object]".
      if (next['color'] !== undefined && typeof next['color'] !== 'string') delete next['color'];
      if (next['gradient'] !== undefined && typeof next['gradient'] !== 'string') delete next['gradient'];
      return next;
    }

    default:
      return raw;
  }
}
