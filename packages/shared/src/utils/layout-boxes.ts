import type { SceneChild, SubtitleEntry } from '../schemas/storyboard.schema.js';
import { estimateTextBox } from './text-metrics.js';

/**
 * Approximate pre-render boxes for the storyboard components.
 *
 * The backend cannot lay out the real DOM, but every component positions itself
 * from a small set of props (`top`, `left`, `width`, item counts), so the same
 * numbers the renderer uses can be estimated here. Both the layout validator and
 * the editorial quality gate read this helper, which keeps their idea of an
 * "overlap" the same as the frame's.
 */

export type BoxKind = 'text' | 'primary' | 'annotation' | 'presenter' | 'caption' | 'backdrop';

export interface ComponentBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoxedComponent {
  child: SceneChild;
  box: ComponentBox;
  kind: BoxKind;
  label: string;
}

function numberProp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringProp(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** `'62%'` → 62; `62` → 62; anything else → fallback. */
export function percentProp(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = /^\s*(-?\d+(?:\.\d+)?)\s*%\s*$/.exec(value);
    if (match?.[1]) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
}

/** Width props accept `'90%'`, `880`, or nothing (component default). */
function widthProp(value: unknown, fallback: number, frameWidth: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const percent = /^\s*(\d+(?:\.\d+)?)\s*%\s*$/.exec(value);
    if (percent?.[1]) return (Number(percent[1]) / 100) * frameWidth;
  }
  return fallback;
}

function centered(
  centerXPercent: number,
  centerYPercent: number,
  width: number,
  height: number,
  frameWidth: number,
  frameHeight: number,
): ComponentBox {
  const centerX = (centerXPercent / 100) * frameWidth;
  const centerY = (centerYPercent / 100) * frameHeight;
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}

/** Text block height for the props the renderer actually passes to AnimatedText. */
function animatedTextBox(child: SceneChild, frameWidth: number, frameHeight: number): ComponentBox {
  const text = stringProp(child.props['text']);
  const fontSize = numberProp(child.props['fontSize'], 60);
  const width = widthProp(child.props['width'], frameWidth * 0.9, frameWidth);
  const textWidth = Math.max(200, width - 80);
  const estimated = estimateTextBox(text, fontSize, textWidth);
  const height = Math.min(frameHeight * 0.3, Math.max(fontSize * 1.3, estimated.height));

  const top = child.props['top'];
  const bottom = child.props['bottom'];
  let y: number;
  if (typeof top === 'string' || typeof top === 'number') {
    y = (percentProp(top, 10) / 100) * frameHeight;
  } else if (typeof bottom === 'string' || typeof bottom === 'number') {
    y = frameHeight - (percentProp(bottom, 8) / 100) * frameHeight - height;
  } else {
    y = frameHeight * 0.1;
  }

  return {
    x: (percentProp(child.props['left'], 50) / 100) * frameWidth - width / 2,
    y,
    width,
    height,
  };
}

function subtitleBox(child: SceneChild, frameWidth: number, frameHeight: number): ComponentBox {
  const entries = Array.isArray(child.props['entries'])
    ? (child.props['entries'] as SubtitleEntry[])
    : [];
  const longest = entries.reduce(
    (text, entry) => (typeof entry?.text === 'string' && entry.text.length > text.length ? entry.text : text),
    '',
  );
  const fontSize = numberProp(child.props['fontSize'], 44);
  const width = widthProp(child.props['maxWidth'], frameWidth * 0.85, frameWidth);
  const estimated = estimateTextBox(longest, fontSize, width - 64);
  const height = Math.max(fontSize * 1.4, estimated.height + 32);
  const bottom = percentProp(child.props['bottom'], 8);
  return {
    x: frameWidth / 2 - width / 2,
    y: frameHeight - (bottom / 100) * frameHeight - height,
    width,
    height,
  };
}

function bubbleBox(child: SceneChild, frameWidth: number, frameHeight: number): ComponentBox {
  const width = Math.min(numberProp(child.props['width'], 820), frameWidth * 0.88);
  const fontSize = numberProp(child.props['fontSize'], 36);
  const text = stringProp(child.props['text']);
  const estimated = estimateTextBox(text, fontSize, width - 68);
  const hasImage = stringProp(child.props['image']).startsWith('data:image/');
  const height = estimated.height + 60 + (hasImage ? 110 : 0);
  return centered(
    percentProp(child.props['left'], 50),
    percentProp(child.props['top'], 62),
    width,
    height,
    frameWidth,
    frameHeight,
  );
}

function processFlowBox(child: SceneChild, frameWidth: number, frameHeight: number): ComponentBox {
  const steps = Array.isArray(child.props['steps']) ? child.props['steps'] : [];
  const count = Math.max(1, steps.length);
  const direction = stringProp(child.props['direction'], count > 2 ? 'vertical' : 'horizontal');
  const spacing = numberProp(child.props['stepSpacing'], direction === 'vertical' ? 64 : 96);
  const itemHeight = 80 + 12 + 30 * 2;

  if (direction === 'vertical') {
    const height = count * itemHeight + (count - 1) * Math.max(18, spacing - 40);
    return centered(
      percentProp(child.props['left'], 50),
      percentProp(child.props['top'], 54),
      frameWidth * 0.92,
      height,
      frameWidth,
      frameHeight,
    );
  }

  const rows = Math.ceil(count / 3);
  const height = rows * itemHeight + (rows - 1) * 20;
  return centered(
    percentProp(child.props['left'], 50),
    percentProp(child.props['top'], 54),
    frameWidth * 0.92,
    height,
    frameWidth,
    frameHeight,
  );
}

function animatedDiagramBox(child: SceneChild, frameWidth: number, frameHeight: number): ComponentBox {
  const width = Math.max(300, Math.min(numberProp(child.props['width'], 600), frameWidth * 0.9));
  const items = Array.isArray(child.props['items']) ? child.props['items'] : [];
  const count = Math.max(1, items.length);
  const columns = count <= 3 ? count : count === 4 ? 2 : 3;
  const rows = Math.ceil(count / columns);
  // Auto layout derives the panel from the item count, so a two-item diagram is
  // not a 600×400 panel with two tiny clustered tiles.
  const cell = Math.max(96, Math.min(150, width / columns));
  const height = Math.max(200, rows * (cell + 54) + 32);
  return centered(
    percentProp(child.props['left'], 50),
    percentProp(child.props['top'], 50),
    width,
    child.props['layout'] === 'manual'
      ? numberProp(child.props['height'], 400)
      : height,
    frameWidth,
    frameHeight,
  );
}

function conceptDiagramBox(child: SceneChild, frameWidth: number, frameHeight: number): ComponentBox {
  const iconSize = numberProp(child.props['iconSize'], 140);
  const width = frameWidth * 0.92;
  const height = iconSize + 10 + Math.round(iconSize * 0.13) * 2.4 + 24;
  return centered(
    percentProp(child.props['left'], 50),
    percentProp(child.props['top'], 58),
    width,
    height,
    frameWidth,
    frameHeight,
  );
}

function timelineBox(child: SceneChild, frameWidth: number, frameHeight: number): ComponentBox {
  const events = Array.isArray(child.props['events']) ? child.props['events'] : [];
  const count = Math.max(1, events.length);
  const height = Math.min(frameHeight * 0.5, count * 110 + 40);
  return centered(
    percentProp(child.props['left'], 50),
    percentProp(child.props['top'], 58),
    widthProp(child.props['width'], 880, frameWidth),
    height,
    frameWidth,
    frameHeight,
  );
}

function teacherBox(child: SceneChild, frameWidth: number, frameHeight: number): ComponentBox {
  const size = numberProp(child.props['size'], 120);
  return centered(
    percentProp(child.props['left'], 50),
    percentProp(child.props['top'], 78),
    size,
    size * 1.75,
    frameWidth,
    frameHeight,
  );
}

/**
 * Estimated on-screen box for a child, or null when the component has no fixed
 * position (Subtitle is handled separately as a caption band).
 */
export function estimateComponentBox(
  child: SceneChild,
  frameWidth: number,
  frameHeight: number,
): BoxedComponent | null {
  const box = (
    value: ComponentBox,
    kind: BoxKind,
    label?: string,
  ): BoxedComponent => ({ child, box: value, kind, label: label ?? child.component });

  switch (child.component) {
    case 'AnimatedText':
      return box(animatedTextBox(child, frameWidth, frameHeight), 'text', 'title');

    case 'Subtitle':
      return box(subtitleBox(child, frameWidth, frameHeight), 'caption', 'captions');

    case 'SpeechBubble':
      return box(bubbleBox(child, frameWidth, frameHeight), 'annotation', 'speech bubble');

    case 'ProcessFlow': {
      const steps = Array.isArray(child.props['steps']) ? child.props['steps'] : [];
      if (steps.length === 0) {
        return box({ x: 0, y: frameHeight * 0.4, width: frameWidth, height: frameHeight * 0.2 }, 'primary', 'process flow');
      }
      return box(processFlowBox(child, frameWidth, frameHeight), 'primary', 'process flow');
    }

    case 'AnimatedDiagram': {
      const items = Array.isArray(child.props['items']) ? child.props['items'] : [];
      if (items.length === 0 && !stringProp(child.props['equation'])) {
        return box({ x: 0, y: frameHeight * 0.4, width: frameWidth, height: frameHeight * 0.2 }, 'primary', 'diagram');
      }
      return box(animatedDiagramBox(child, frameWidth, frameHeight), 'primary', 'diagram');
    }

    case 'ConceptDiagram':
      return box(conceptDiagramBox(child, frameWidth, frameHeight), 'primary', 'concept diagram');

    case 'Timeline':
      return box(timelineBox(child, frameWidth, frameHeight), 'primary', 'timeline');

    case 'SplitScreenComparison':
      return box(
        { x: frameWidth * 0.02, y: frameHeight * 0.24, width: frameWidth * 0.96, height: frameHeight * 0.5 },
        'primary',
        'comparison',
      );

    case 'AnnotatedCallout':
      return box(
        { x: frameWidth * 0.02, y: frameHeight * 0.2, width: frameWidth * 0.96, height: frameHeight * 0.6 },
        'primary',
        'callout',
      );

    case 'ComparisonChart':
    case 'SummaryScene':
      return box(
        centered(
          percentProp(child.props['left'], 50),
          percentProp(child.props['top'], 56),
          frameWidth * 0.9,
          frameHeight * 0.36,
          frameWidth,
          frameHeight,
        ),
        'primary',
        child.component === 'SummaryScene' ? 'recap' : 'chart',
      );

    case 'Teacher':
      return box(teacherBox(child, frameWidth, frameHeight), 'presenter', 'instructor');

    case 'EducationalObject':
    case 'ObjectGroup':
    case 'QuestionCard':
    case 'Callout':
    case 'ObjectZoom':
      return box(
        centered(
          percentProp(child.props['left'], 50),
          percentProp(child.props['top'], 50),
          frameWidth * 0.5,
          frameHeight * 0.3,
          frameWidth,
          frameHeight,
        ),
        'primary',
        child.component === 'EducationalObject' ? 'object' : child.component,
      );

    case 'NumberCounter':
    case 'AnimatedNumber':
      return box(
        centered(
          percentProp(child.props['left'], 50),
          percentProp(child.props['top'], 33),
          frameWidth * 0.6,
          frameHeight * 0.16,
          frameWidth,
          frameHeight,
        ),
        'primary',
        'number',
      );

    case 'ImageScene':
      return box({ x: 0, y: 0, width: frameWidth, height: frameHeight }, 'backdrop', 'image scene');

    case 'BackgroundScene':
    case 'EndScreen':
    case 'Confetti':
    case 'ProgressBar':
      return box({ x: 0, y: 0, width: frameWidth, height: frameHeight }, 'backdrop', child.component);

    case 'HighlightedRegion':
    case 'KineticTypography':
    case 'MultiplicationTable':
      return box(
        centered(50, 50, frameWidth * 0.9, frameHeight * 0.4, frameWidth, frameHeight),
        'primary',
        child.component,
      );

    default:
      return null;
  }
}

/** Intersection area as a share of the smaller box. 0 = no overlap. */
export function overlapRatio(a: ComponentBox, b: ComponentBox): number {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return 0;
  const intersection = (right - left) * (bottom - top);
  const smaller = Math.min(a.width * a.height, b.width * b.height);
  return smaller <= 0 ? 0 : intersection / smaller;
}
