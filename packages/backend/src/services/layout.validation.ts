import { estimateTextBox } from '@edumotion/shared';
import type { SceneChild, StoryboardPlan } from '@edumotion/shared';

/** Approximate pre-render layout checks, using the same estimator as the renderer. */
export interface LayoutIssue {
  sceneId: string;
  severity: 'blocking' | 'warning';
  message: string;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function percentValue(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*%\s*$/.exec(value);
  if (!match?.[1]) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
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

export function validateLayout(
  storyboard: StoryboardPlan,
  width: number,
  height: number,
): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const maxWidth = Math.max(240, width * 0.82);

  for (const scene of storyboard.scenes) {
    for (const child of scene.children ?? []) {
      if (child.component === 'Subtitle') continue;

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
        const top = percentValue(child.props['top']);
        const bottom = percentValue(child.props['bottom']);
        if (top !== null && top > 32) {
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
    }
  }

  return issues;
}
