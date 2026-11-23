import {
  estimateTextBox,
  estimateComponentBox,
  overlapRatio,
  percentProp,
  type BoxedComponent,
  type SceneChild,
  type StoryboardPlan,
} from '@edumotion/shared';

/**
 * Pre-render editorial layout checks.
 *
 * The old validator only measured text height. A scene could still show its
 * title, its speech bubble and its caption saying the same sentence, place a
 * bubble on top of a process step, or collapse a diagram into one corner. This
 * checks the boxes the renderer will actually occupy, using the shared
 * estimator, plus the text/content failures a frame review would catch.
 */
export interface LayoutIssue {
  sceneId: string;
  severity: 'blocking' | 'warning';
  message: string;
}

const CONJUNCTION_START =
  /^(and|but|so|because|or|nor|yet|which|while|that|where|when|who|whom|whose)\b/i;
const DANGLING_END =
  /(?:[,;:\-–—]|\b(?:and|but|so|because|which|while|that|by|in|at|to|of|the|a|an|with|for|from|as))$/i;

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9%]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Same sentence, or a truncated prefix of it. */
function isDuplicateText(a: string, b: string): boolean {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return shorter.length >= 18 && longer.startsWith(shorter);
}

function childStrings(child: SceneChild): { label: string; text: string; fontSize: number }[] {
  const entries: { label: string; text: string; fontSize: number }[] = [];
  const text = child.props['text'];
  const title = child.props['title'];
  const points = child.props['points'];
  const items = child.props['items'];

  if (typeof text === 'string') {
    entries.push({
      label: child.component,
      text,
      fontSize: numberValue(child.props['fontSize'], 60),
    });
  }
  if (typeof title === 'string') {
    entries.push({
      label: `${child.component} title`,
      text: title,
      fontSize: numberValue(child.props['fontSize'], 52),
    });
  }
  if (Array.isArray(points)) {
    for (const point of points.slice(0, 6)) {
      if (typeof point === 'string') {
        entries.push({ label: `${child.component} point`, text: point, fontSize: 34 });
      }
    }
  }
  if (Array.isArray(items)) {
    for (const item of items.slice(0, 6)) {
      if (item && typeof item === 'object' && typeof (item as { label?: unknown }).label === 'string') {
        entries.push({
          label: `${child.component} tile`,
          text: (item as { label: string }).label,
          fontSize: 34,
        });
      }
    }
  }
  return entries;
}

function subtitleTexts(child: SceneChild): string[] {
  if (child.component !== 'Subtitle') return [];
  const entries = child.props['entries'];
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) =>
      typeof entry === 'object' && entry !== null
        ? (entry as { text?: unknown }).text
        : undefined,
    )
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

function checkDuplicateText(sceneId: string, children: SceneChild[]): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const title = children.find((child) => child.component === 'AnimatedText');
  const titleText = typeof title?.props['text'] === 'string' ? title.props['text'] : '';
  const bubbles = children.filter((child) => child.component === 'SpeechBubble');
  const cues = children.flatMap(subtitleTexts);

  for (const bubble of bubbles) {
    const bubbleText = typeof bubble.props['text'] === 'string' ? bubble.props['text'] : '';
    if (!bubbleText.trim()) continue;
    if (titleText && isDuplicateText(bubbleText, titleText)) {
      issues.push({
        sceneId,
        severity: 'blocking',
        message: `Speech bubble repeats the scene title: "${bubbleText.slice(0, 48)}"`,
      });
    } else if (cues.some((cue) => isDuplicateText(bubbleText, cue))) {
      issues.push({
        sceneId,
        severity: 'blocking',
        message: `Speech bubble repeats a caption instead of adding a new idea: "${bubbleText.slice(0, 48)}"`,
      });
    }
  }

  if (titleText && cues.some((cue) => isDuplicateText(titleText, cue))) {
    issues.push({
      sceneId,
      severity: 'blocking',
      message: `Title repeats the narration: "${titleText.slice(0, 48)}"`,
    });
  }

  // Two bubbles in one scene is a stacking bug, not a design choice.
  if (bubbles.length > 1) {
    issues.push({
      sceneId,
      severity: 'warning',
      message: `Scene has ${bubbles.length} speech bubbles; keep one annotation.`,
    });
  }

  return issues;
}

function checkOverlap(
  sceneId: string,
  boxes: BoxedComponent[],
  width: number,
  height: number,
): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const content = boxes.filter((box) => box.kind !== 'backdrop');

  for (let i = 0; i < content.length; i++) {
    const a = content[i];
    if (!a) continue;
    for (let j = i + 1; j < content.length; j++) {
      const b = content[j];
      if (!b) continue;
      const ratio = overlapRatio(a.box, b.box);
      if (ratio <= 0.1) continue;

      const involvesPresenter = a.kind === 'presenter' || b.kind === 'presenter';
      const annotationBlocking =
        (a.kind === 'annotation' || b.kind === 'annotation') && ratio > 0.15;
      const captionBlocking =
        (a.kind === 'caption' || b.kind === 'caption') && ratio > 0.2;

      if (involvesPresenter) {
        if (ratio > 0.18) {
          issues.push({
            sceneId,
            severity: 'warning',
            message: `${a.label} overlaps ${b.label} (${Math.round(ratio * 100)}% of the smaller element).`,
          });
        }
      } else if (annotationBlocking || captionBlocking) {
        issues.push({
          sceneId,
          severity: 'blocking',
          message: `${a.label} overlaps ${b.label} (${Math.round(ratio * 100)}% of the smaller element).`,
        });
      } else if (ratio > 0.3) {
        issues.push({
          sceneId,
          severity: 'warning',
          message: `${a.label} and ${b.label} overlap (${Math.round(ratio * 100)}%).`,
        });
      }
    }

    if (
      a.kind !== 'caption'
      && (a.box.x < -width * 0.02
        || a.box.y < -height * 0.02
        || a.box.x + a.box.width > width * 1.02
        || a.box.y + a.box.height > height * 1.02)
    ) {
      issues.push({
        sceneId,
        severity: 'warning',
        message: `${a.label} extends outside the frame.`,
      });
    }
  }

  return issues;
}

function checkDiagram(sceneId: string, child: SceneChild): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  if (child.component !== 'AnimatedDiagram') return issues;

  const items = Array.isArray(child.props['items'])
    ? (child.props['items'] as Array<Record<string, unknown>>)
    : [];
  const equation = typeof child.props['equation'] === 'string' ? child.props['equation'].trim() : '';

  if (items.length === 0 && !equation) {
    issues.push({
      sceneId,
      severity: 'warning',
      message: 'AnimatedDiagram has no items and no equation, so the panel renders empty.',
    });
    return issues;
  }

  const labels = items
    .map((item) => (typeof item['label'] === 'string' ? item['label'] : ''))
    .filter(Boolean);
  if (labels.length > 1 && new Set(labels.map((label) => normalize(label))).size === 1) {
    issues.push({
      sceneId,
      severity: 'warning',
      message: 'Every diagram tile carries the same label.',
    });
  }
  if (items.some((item) => typeof item['label'] === 'string' && item['label'].length > 26)) {
    issues.push({
      sceneId,
      severity: 'warning',
      message: 'A diagram label is longer than 26 characters and may wrap over its neighbour.',
    });
  }

  // The model used to return page coordinates (`x: 100, y: 150`) which the
  // renderer treated as offsets from the centre, collapsing every item into one
  // corner. Auto layout ignores those values; only manual layout is checked.
  if (child.props['layout'] === 'manual' && items.length >= 2) {
    const points = items.map((item) => {
      const position = item['position'];
      return {
        x: position && typeof position === 'object'
          ? numberValue((position as Record<string, unknown>)['x'], 0)
          : 0,
        y: position && typeof position === 'object'
          ? numberValue((position as Record<string, unknown>)['y'], 0)
          : 0,
      };
    });
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const spreadX = Math.max(...xs) - Math.min(...xs);
    const spreadY = Math.max(...ys) - Math.min(...ys);
    const panelWidth = numberValue(child.props['width'], 600);
    const panelHeight = numberValue(child.props['height'], 400);

    if (spreadX < panelWidth * 0.3 && spreadY < panelHeight * 0.3) {
      issues.push({
        sceneId,
        severity: 'blocking',
        message: `Diagram items are clustered in one corner (spread ${Math.round(spreadX)}×${Math.round(spreadY)}px).`,
      });
    }
  }

  return issues;
}

function checkTitle(sceneId: string, child: SceneChild): LayoutIssue[] {
  if (child.component !== 'AnimatedText') return [];
  const text = typeof child.props['text'] === 'string' ? child.props['text'].trim() : '';
  if (!text) return [];

  if (text.endsWith('…') || text.endsWith('...')) {
    return [{
      sceneId,
      severity: 'blocking',
      message: `Title is truncated with an ellipsis: "${text.slice(0, 48)}"`,
    }];
  }
  if (DANGLING_END.test(text)) {
    return [{
      sceneId,
      severity: 'blocking',
      message: `Title ends on a dangling connector: "${text.slice(0, 48)}"`,
    }];
  }
  return [];
}

function checkCaptionFragments(sceneId: string, children: SceneChild[]): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const cues = children.flatMap(subtitleTexts);
  const first = cues[0];
  if (!first) return issues;

  // Only the first visible cue of a scene can look like a continuation; later
  // cues inside the same sentence are normal.
  if (CONJUNCTION_START.test(first.trim())) {
    issues.push({
      sceneId,
      severity: 'warning',
      message: `Caption starts with a conjunction, so the scene boundary split a sentence: "${first.slice(0, 48)}"`,
    });
  }
  return issues;
}

function checkArtwork(sceneId: string, children: SceneChild[]): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  for (const child of children) {
    const hasImage = typeof child.props['image'] === 'string'
      && child.props['image'].startsWith('data:image/');
    if (!hasImage) continue;
    const alt = typeof child.props['imageAlt'] === 'string' ? child.props['imageAlt'].trim() : '';
    if (!alt) {
      issues.push({
        sceneId,
        severity: 'warning',
        message: `${child.component} has artwork with no verified label (imageAlt).`,
      });
    }
  }
  return issues;
}

export function validateLayout(
  storyboard: StoryboardPlan,
  width: number,
  height: number,
): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const maxWidth = Math.max(240, width * 0.82);
  const lastScene = storyboard.scenes[storyboard.scenes.length - 1];

  for (const scene of storyboard.scenes) {
    const children = scene.children ?? [];
    const boxes: BoxedComponent[] = [];

    for (const child of children) {
      if (child.component === 'Subtitle') {
        const boxed = estimateComponentBox(child, width, height);
        if (boxed) boxes.push(boxed);
        continue;
      }

      const boxed = estimateComponentBox(child, width, height);
      if (boxed) boxes.push(boxed);

      for (const entry of childStrings(child)) {
        const box = estimateTextBox(entry.text, entry.fontSize, maxWidth);
        const textShare = box.height / Math.max(1, height);

        if (entry.text.length > 160) {
          issues.push({
            sceneId: scene.id,
            severity: 'blocking',
            message: `${entry.label} is ${entry.text.length} characters; it cannot fit the safe area.`,
          });
        } else if (textShare > 0.28) {
          issues.push({
            sceneId: scene.id,
            severity: 'blocking',
            message: `${entry.label} needs ${box.lines} lines (${Math.round(textShare * 100)}% of frame height).`,
          });
        } else if (textShare > 0.2) {
          issues.push({
            sceneId: scene.id,
            severity: 'warning',
            message: `${entry.label} is close to the safe-area limit (${box.lines} lines).`,
          });
        }
      }

      if (child.component === 'AnimatedText') {
        const top = percentProp(child.props['top'], 10);
        const bottom = child.props['bottom'] === undefined
          ? null
          : percentProp(child.props['bottom'], 8);
        if (top > 32) {
          issues.push({
            sceneId: scene.id,
            severity: 'blocking',
            message: `Title starts at ${top}% and overlaps the visual area.`,
          });
        }
        if (bottom !== null && bottom < 8) {
          issues.push({
            sceneId: scene.id,
            severity: 'warning',
            message: `Title sits at the very bottom (${bottom}%).`,
          });
        }
      }

      issues.push(...checkTitle(scene.id, child));
      issues.push(...checkDiagram(scene.id, child));

      if (child.component === 'ProcessFlow') {
        const steps = Array.isArray(child.props['steps']) ? child.props['steps'] : [];
        if (steps.length < 2) {
          issues.push({
            sceneId: scene.id,
            severity: 'warning',
            message: 'ProcessFlow has fewer than two steps.',
          });
        }
      }
      if (child.component === 'ConceptDiagram') {
        const items = Array.isArray(child.props['items']) ? child.props['items'] : [];
        if (items.length < 2) {
          issues.push({
            sceneId: scene.id,
            severity: 'warning',
            message: 'ConceptDiagram needs at least two labelled items.',
          });
        }
      }
    }

    issues.push(...checkDuplicateText(scene.id, children));
    issues.push(...checkCaptionFragments(scene.id, children));
    issues.push(...checkArtwork(scene.id, children));
    issues.push(...checkOverlap(scene.id, boxes, width, height));

    // A presenter never appears on the closing card.
    if (scene === lastScene && children.some((child) => child.component === 'Teacher')) {
      issues.push({
        sceneId: scene.id,
        severity: 'blocking',
        message: 'The instructor must not appear in the final EndScreen scene.',
      });
    }
  }

  return issues;
}
