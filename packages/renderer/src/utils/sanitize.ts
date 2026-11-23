import { PALETTE_IDS, type ComponentName, type SubtitleEntry } from '@edumotion/shared';

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
  'brain', 'bone', 'skeleton', 'dna', 'neuron', 'circuit', 'server', 'network',
  'equation', 'chart', 'timeline', 'beaker', 'testtube', 'molecule', 'electron',
  'proton', 'neutron', 'bacteria', 'virus', 'organ', 'femur', 'skull', 'ribcage'
]);
const OBJECT_ANIMATIONS = new Set(['fadeIn', 'bounce', 'none']);
const CHARACTER_STATES = new Set(['idle', 'wave', 'point', 'thinking']);
const THEMES = new Set(['educational', 'modern', 'playful', 'minimal']);
const PATTERNS = new Set(['none', 'dots', 'grid', 'waves']);
const PALETTES = new Set<string>(PALETTE_IDS);
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

/**
 * Accent colours are used to build gradients and glows ("#FFD16655"), so only a
 * plain six-digit hex survives; a named colour or a broken value would paint
 * "undefined" into the CSS.
 */
function hexColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Only embedded images can render without a network fetch. */
function dataImage(value: unknown): string | null {
  return typeof value === 'string' && /^data:image\//i.test(value) && value.length <= 2_000_000
    ? value
    : null;
}

/** Keep a valid inlined image and drop model-supplied URLs or file paths. */
function sanitizeImageProp(record: Props): Props {
  const next = { ...record };
  const image = dataImage(record['image']);
  if (image) {
    next['image'] = image;
    const alt = str(record['imageAlt'], '').slice(0, 120);
    if (alt) next['imageAlt'] = alt;
    else delete next['imageAlt'];
  } else {
    delete next['image'];
    delete next['imageAlt'];
  }
  return next;
}

function splitWords(value: unknown): NonNullable<SubtitleEntry['words']> | null {
  if (!Array.isArray(value)) return null;

  const words = value
    .filter(isRecord)
    .map((word) => ({
      text: str(word['text'], '').trim(),
      startMs: num(word['startMs'], 0, 0, 1e9),
      endMs: num(word['endMs'], 0, 0, 1e9),
    }))
    .filter((word) => word.text.length > 0 && word.endMs >= word.startMs);

  return words.length > 0 ? words : null;
}

function subtitleEntries(value: unknown): SubtitleEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((entry, i) => {
      // Per-word timings drive the spoken-word highlight; dropping them here used
      // to flatten captions back to static sentences.
      const words = splitWords(entry['words']);
      const cue: SubtitleEntry = {
        index: Math.round(num(entry['index'], i, 0, 1e6)),
        startMs: num(entry['startMs'], 0, 0, 1e9),
        endMs: num(entry['endMs'], 0, 0, 1e9),
        text: str(entry['text'], ''),
      };
      return words ? { ...cue, words } : cue;
    })
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
      return sanitizeImageProp({
        ...raw,
        type: enumValue(raw['type'], OBJECT_TYPES, 'book'),
        size: num(raw['size'], 100, 40, 700),
        animation: enumValue(raw['animation'], OBJECT_ANIMATIONS, 'bounce'),
      });

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

    case 'ConceptDiagram': {
      const items = Array.isArray(raw['items'])
        ? raw['items']
            .filter(isRecord)
            .map((item) => {
              // Artwork arrives inlined by the backend; anything else (a model
              // URL or a local file path) would stall the render, so it is dropped
              // and the tile falls back to its built-in glyph.
              const image = item['image'];
              const usable = typeof image === 'string'
                && /^data:image\//i.test(image)
                && image.length <= 2_000_000
                ? image
                : undefined;
              return {
                icon: enumValue(item['icon'], OBJECT_TYPES, 'book'),
                label: str(item['label'], '').trim().slice(0, 32),
                ...(usable ? { image: usable } : {}),
              };
            })
            .filter((item) => item.label.length > 0)
            .slice(0, 5)
        : [];
      if (items.length === 0) return null;
      return {
        ...raw,
        items,
        layout: raw['layout'] === 'grid' ? 'grid' : 'row',
        iconSize: num(raw['iconSize'], 140, 40, 320),
        accent: str(raw['accent'], '#8f7be0'),
        title: str(raw['title'], '').slice(0, 80),
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
        title: str(raw['title'] ?? raw['text'], 'Thanks for Watching!'),
        subtitle: str(raw['subtitle'], 'Subscribe for more educational videos'),
        logoText: str(raw['logoText'], 'EduMotion'),
        showConfetti: bool(raw['showConfetti'], false),
      };

    case 'SplitScreenComparison': {
      const leftRecord = isRecord(raw['left'])
        ? raw['left']
        : typeof raw['left'] === 'string'
          ? { content: raw['left'] }
          : {};
      const rightRecord = isRecord(raw['right'])
        ? raw['right']
        : typeof raw['right'] === 'string'
          ? { content: raw['right'] }
          : {};
      const leftContent = str(
        leftRecord['content'] ?? leftRecord['text'] ?? raw['leftTitle'],
        '',
      );
      const rightContent = str(
        rightRecord['content'] ?? rightRecord['text'] ?? raw['rightTitle'],
        '',
      );
      if (!leftContent && !rightContent) return null;
      return {
        ...raw,
        left: sanitizeImageProp({ ...leftRecord, content: leftContent || rightContent }),
        right: sanitizeImageProp({ ...rightRecord, content: rightContent || leftContent }),
        comparisonLabel: str(raw['comparisonLabel'], 'vs'),
      };
    }

    case 'ProcessFlow': {
      const steps = Array.isArray(raw['steps'])
        ? raw['steps']
            .map((step): Props | null => {
              if (typeof step === 'string') return { label: step.trim() };
              if (!isRecord(step)) return null;
              const label = str(step['label'] ?? step['text'] ?? step['title'], '');
              if (!label) return null;
              const next = sanitizeImageProp({ ...step, label });
              const iconName = str(step['iconName'], '');
              if (iconName && OBJECT_TYPES.has(iconName)) next['iconName'] = iconName;
              else delete next['iconName'];
              return next;
            })
            .filter((step): step is Props => step !== null)
        : [];
      if (steps.length === 0) return null;
      const direction = raw['direction'] === 'vertical' || raw['direction'] === 'horizontal'
        ? raw['direction']
        : steps.length > 2
          ? 'vertical'
          : 'horizontal';
      return {
        ...raw,
        steps,
        direction,
        stepSpacing: num(raw['stepSpacing'], direction === 'vertical' ? 64 : 96, 20, 180),
      };
    }

    case 'AnimatedDiagram': {
      const items = Array.isArray(raw['items'])
        ? raw['items']
            .filter(isRecord)
            .map((item): Props | null => {
              const label = str(item['label'] ?? item['text'], '');
              if (!label) return null;
              const position = isRecord(item['position']) ? item['position'] : {};
              return sanitizeImageProp({
                ...item,
                icon: str(item['icon'], 'book') || 'book',
                label,
                position: { x: num(position['x'], 0), y: num(position['y'], 0) },
              });
            })
            .filter((item): item is Props => item !== null)
        : [];
      const equation = str(raw['equation'] ?? raw['formula'], '');
      if (items.length === 0 && !equation) return null;
      return { ...raw, items, ...(equation ? { equation } : {}) };
    }

    case 'Timeline': {
      const events = Array.isArray(raw['events'])
        ? raw['events']
            .map((event): Props | null => {
              if (typeof event === 'string') return { date: '', title: event.trim() };
              if (!isRecord(event)) return null;
              const title = str(event['title'] ?? event['label'] ?? event['text'], '');
              return title
                ? sanitizeImageProp({ ...event, date: str(event['date'], ''), title })
                : null;
            })
            .filter((event): event is Props => event !== null)
        : [];
      if (events.length === 0) return null;
      return { ...raw, events };
    }

    case 'KineticTypography': {
      const text = str(raw['text'], '');
      const words = Array.isArray(raw['words']) ? raw['words'] : [];
      if (!text && words.length === 0) return null;
      return { ...raw, text, words };
    }

    case 'NumberCounter': {
      const target = num(raw['target'], Number.NaN);
      if (!Number.isFinite(target)) return null;
      return { ...raw, target };
    }

    case 'Callout': {
      const text = str(raw['text'], '').trim();
      if (!text) return null;
      const target = isRecord(raw['target']) ? raw['target'] : {};
      return {
        ...raw,
        text,
        target: { x: num(target['x'], 50, 0, 100), y: num(target['y'], 50, 0, 100) },
      };
    }

    // These components need React children, which a JSON storyboard cannot
    // provide. Dropping them lets the rest of the scene render.
    case 'HighlightedRegion':
    case 'ObjectZoom':
      return null;

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
      // Only palettes the renderer actually paints survive; anything else would
      // silently fall back to the default theme.
      if (typeof next['palette'] !== 'string' || !PALETTES.has(next['palette'])) delete next['palette'];
      return next;
    }

    case 'SpeechBubble': {
      const value = str(raw['text'], '').trim();
      if (!value) return null;
      return sanitizeImageProp({
        ...raw,
        text: value.slice(0, 220),
        speaker: str(raw['speaker'], '').slice(0, 32),
        tail: enumValue(raw['tail'], new Set(['left', 'right', 'none']), 'left'),
        variant: enumValue(
          raw['variant'],
          new Set(['statement', 'question', 'thought']),
          'statement',
        ),
        width: num(raw['width'], 820, 240, 1400),
        fontSize: num(raw['fontSize'], 34, 16, 90),
        accent: hexColor(raw['accent'], '#FFD166'),
      });
    }

    case 'AnnotatedCallout': {
      const points = Array.isArray(raw['points'])
        ? raw['points']
            .filter(isRecord)
            .map((point) => ({
              label: str(point['label'], '').trim().slice(0, 28),
              detail: str(point['detail'], '').trim().slice(0, 60),
              x: num(point['x'], 50, 2, 98),
              y: num(point['y'], 50, 2, 98),
            }))
            .filter((point) => point.label.length > 0)
            .slice(0, 3)
        : [];
      if (points.length === 0) return null;

      const image = raw['image'];
      const usableImage =
        typeof image === 'string' && /^data:image\//i.test(image) && image.length <= 2_000_000
          ? image
          : undefined;
      const next: Props = {
        ...raw,
        subject: enumValue(raw['subject'], OBJECT_TYPES, 'book'),
        points,
        accent: hexColor(raw['accent'], '#FFD166'),
      };
      if (usableImage) next['image'] = usableImage;
      else delete next['image'];
      return next;
    }

    case 'ComparisonChart': {
      const bars = Array.isArray(raw['bars'])
        ? raw['bars']
            .filter(isRecord)
            .map((bar) => {
              const suffix = str(bar['suffix'], '').slice(0, 6);
              return {
                label: str(bar['label'], '').trim().slice(0, 28),
                value: num(bar['value'], Number.NaN, 0, 1e9),
                ...(suffix ? { suffix } : {}),
              };
            })
            .filter((bar) => bar.label.length > 0 && Number.isFinite(bar.value))
            .slice(0, 4)
        : [];
      if (bars.length === 0) return null;
      return sanitizeImageProp({
        ...raw,
        title: str(raw['title'], '').slice(0, 60),
        bars,
        accent: hexColor(raw['accent'], '#FFD166'),
      });
    }

    case 'SummaryScene': {
      const points = stringList(raw['points'], [])
        .map((point) => point.slice(0, 60))
        .slice(0, 5);
      if (points.length === 0) return null;
      return sanitizeImageProp({
        ...raw,
        title: str(raw['title'], 'In short').slice(0, 48),
        badgeText: str(raw['badgeText'], 'Recap').slice(0, 18),
        points,
        accent: hexColor(raw['accent'], '#FFD166'),
      });
    }

    default:
      return raw;
  }
}
