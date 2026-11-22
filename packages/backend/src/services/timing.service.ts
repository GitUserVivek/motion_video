import type { StoryboardPlan, SceneInstruction } from '@edumotion/shared';

/**
 * One timing contract for the whole pipeline:
 *
 *   scene.startFrame / scene.endFrame  → absolute video frames
 *   child.props.startFrame             → frames relative to its own scene
 *
 * The renderer converts the child value exactly once:
 *
 *   absoluteStartFrame = scene.startFrame + child.props.startFrame
 *
 * Normalisation happens here, before validation/rendering, so a model that
 * emits a global frame or a negative value cannot silently start an animation
 * before its scene.
 */

export interface TimingEntry {
  sceneId: string;
  sceneStart: number;
  sceneEnd: number;
  childIndex: number;
  component: string;
  relativeStart: number;
  absoluteStart: number;
  action: 'kept' | 'defaulted' | 'rebased' | 'clamped';
  note?: string;
}

export interface TimingReport {
  timingMode: 'scene-relative';
  entries: TimingEntry[];
  repaired: number;
  issues: string[];
}

const DEFAULT_START = 4;
const MIN_START = 2;
const END_MARGIN = 5;

function sceneDuration(scene: SceneInstruction): number {
  return Math.max(1, scene.endFrame - scene.startFrame);
}

function normalizeChildStart(
  scene: SceneInstruction,
  raw: unknown,
  legacy: boolean,
): { value: number; action: TimingEntry['action']; note?: string } {
  const duration = sceneDuration(scene);
  const maxStart = Math.max(MIN_START, duration - END_MARGIN);

  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return { value: Math.min(DEFAULT_START, maxStart), action: 'defaulted' };
  }

  let value = raw;
  let action: TimingEntry['action'] = 'kept';
  let note: string | undefined;

  // Legacy storyboards wrote absolute child frames. New storyboards declare
  // scene-relative timing and are never rebased here.
  if (legacy && value >= scene.startFrame && value - scene.startFrame <= duration) {
    value -= scene.startFrame;
    action = 'rebased';
    note = 'Converted a legacy absolute child frame to scene-relative.';
  }

  if (value < 0) {
    value = MIN_START;
    action = 'clamped';
    note = 'Negative child start clamped into its scene.';
  } else if (value < MIN_START) {
    value = MIN_START;
    action = 'clamped';
    note = 'Child started too early; moved inside its scene.';
  } else if (value > maxStart) {
    value = maxStart;
    action = 'clamped';
    note = `Child start ${raw} was outside the ${duration}-frame scene.`;
  }

  return { value, action, ...(note ? { note } : {}) };
}

export function validateTiming(storyboard: StoryboardPlan): string[] {
  const issues: string[] = [];
  if (storyboard.timingMode !== 'scene-relative') {
    issues.push('Storyboard is missing the scene-relative timing marker.');
  }

  for (const scene of storyboard.scenes) {
    const duration = sceneDuration(scene);
    for (const [index, child] of (scene.children ?? []).entries()) {
      const start = child.props['startFrame'];
      if (typeof start !== 'number' || !Number.isFinite(start)) {
        issues.push(`${scene.id} child ${index} has no numeric startFrame.`);
      } else if (start < 0 || start >= duration) {
        issues.push(
          `${scene.id} child ${index} starts at ${start}, outside its ${duration}-frame scene.`,
        );
      }
    }
  }

  return issues;
}

export function normalizeStoryboardTiming(storyboard: StoryboardPlan): {
  storyboard: StoryboardPlan;
  report: TimingReport;
} {
  const legacy = storyboard.timingMode !== 'scene-relative';
  const entries: TimingEntry[] = [];
  const issues: string[] = [];
  let repaired = 0;

  const scenes = storyboard.scenes.map((scene) => {
    const duration = sceneDuration(scene);
    if (duration < 30) {
      issues.push(`${scene.id} is only ${duration} frames long.`);
    }

    const children = (scene.children ?? []).map((child, childIndex) => {
      const normalized = normalizeChildStart(scene, child.props['startFrame'], legacy);
      const absoluteStart = scene.startFrame + normalized.value;

      if (normalized.action !== 'kept') repaired++;
      if (normalized.action === 'clamped') {
        issues.push(
          `${scene.id} child ${childIndex} (${child.component}) start ${String(child.props['startFrame'])} → ${normalized.value}.`,
        );
      }

      entries.push({
        sceneId: scene.id,
        sceneStart: scene.startFrame,
        sceneEnd: scene.endFrame,
        childIndex,
        component: child.component,
        relativeStart: normalized.value,
        absoluteStart,
        action: normalized.action,
        ...(normalized.note ? { note: normalized.note } : {}),
      });

      return {
        ...child,
        props: { ...child.props, startFrame: normalized.value },
      };
    });

    const props = { ...scene.props };
    // A root component may also carry a startFrame; normalise it the same way.
    if (props['startFrame'] !== undefined) {
      const normalized = normalizeChildStart(scene, props['startFrame'], legacy);
      props['startFrame'] = normalized.value;
    }

    return { ...scene, props, children };
  });

  return {
    storyboard: { ...storyboard, timingMode: 'scene-relative', scenes },
    report: {
      timingMode: 'scene-relative',
      entries,
      repaired,
      issues,
    },
  };
}
