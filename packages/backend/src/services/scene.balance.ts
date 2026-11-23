import type { SceneChild, SceneInstruction, StoryboardPlan, SubtitleEntry } from '@edumotion/shared';

/**
 * Split scenes that cover far more narration than one visual can explain.
 *
 * The storyboard model often keeps the first scenes at the minimum duration and
 * dumps every remaining sentence into one closing scene. That produced a
 * 26-second static EndScreen over five teaching sentences. This pass uses the
 * measured caption cues as natural boundaries, so each new scene owns one
 * coherent piece of narration and gets its own deterministic visual later.
 */

const DEFAULT_MAX_SCENE_FRAMES = 240; // 8 seconds at 30 fps
const MIN_PART_FRAMES = 30; // never create a sub-second scene just to split

function sceneStartMs(scene: SceneInstruction, fps: number): number {
  return (scene.startFrame / fps) * 1000;
}

function sceneEndMs(scene: SceneInstruction, fps: number): number {
  return (scene.endFrame / fps) * 1000;
}

interface CueGroup {
  startMs: number;
  endMs: number;
  cues: SubtitleEntry[];
}

/** True when a cue ends a spoken sentence, so it is a clean scene boundary. */
function endsSentence(cue: SubtitleEntry): boolean {
  return /[.!?]["')\]]?\s*$/.test(cue.text.trim());
}

/**
 * Split at a sentence boundary rather than an arbitrary caption phrase. A
 * grouped word cue can end after three words of a sentence; cutting there makes
 * the next scene start mid-thought ("and each…"). When the current group is
 * over budget, the latest sentence end inside it wins, as long as both parts
 * keep their minimum duration.
 */
function sentenceSplitIndex(
  groupCues: SubtitleEntry[],
  groupStartMs: number,
  endMs: number,
  minMs: number,
): number | null {
  for (let index = groupCues.length - 1; index >= 0; index--) {
    const cue = groupCues[index];
    const next = groupCues[index + 1];
    if (!cue || !next || !endsSentence(cue)) continue;
    if (next.startMs - groupStartMs < minMs) continue;
    if (endMs - next.startMs < minMs) continue;
    return index;
  }
  return null;
}

function groupCues(
  scene: SceneInstruction,
  cues: SubtitleEntry[],
  fps: number,
  maxSceneFrames: number,
): CueGroup[] {
  const startMs = sceneStartMs(scene, fps);
  const endMs = sceneEndMs(scene, fps);
  const maxMs = (maxSceneFrames / fps) * 1000;
  const minMs = (MIN_PART_FRAMES / fps) * 1000;

  const groups: CueGroup[] = [];
  let groupStartMs = startMs;
  let groupCues: SubtitleEntry[] = [];

  const splitAt = (boundaryMs: number, keptCues: SubtitleEntry[]): void => {
    groups.push({ startMs: groupStartMs, endMs: boundaryMs, cues: keptCues });
    groupStartMs = boundaryMs;
    groupCues = groupCues.slice(keptCues.length);
  };

  for (const cue of cues) {
    const cueStart = Math.max(startMs, Math.min(cue.startMs, endMs));
    const cueEnd = Math.max(cueStart, Math.min(cue.endMs, endMs));

    if (
      groupCues.length > 0
      && cueEnd - groupStartMs > maxMs
      && cueStart - groupStartMs >= minMs
      && endMs - cueStart >= minMs
    ) {
      // Finish the sentence we are in when it is close to the budget, instead
      // of cutting before the cue and leaving the next scene mid-sentence.
      if (endsSentence(cue) && cueEnd - groupStartMs <= maxMs) {
        groupCues.push(cue);
        groups.push({ startMs: groupStartMs, endMs: cueEnd, cues: groupCues });
        groupStartMs = cueEnd;
        groupCues = [];
        continue;
      }

      const boundary = sentenceSplitIndex(groupCues, groupStartMs, endMs, minMs);
      if (boundary !== null) {
        const kept = groupCues.slice(0, boundary + 1);
        const next = groupCues[boundary + 1] ?? cue;
        splitAt(next.startMs, kept);
      } else {
        groups.push({ startMs: groupStartMs, endMs: cueStart, cues: groupCues });
        groupStartMs = cueStart;
        groupCues = [];
      }
    }
    groupCues.push(cue);
  }

  groups.push({ startMs: groupStartMs, endMs, cues: groupCues });
  return groups;
}

function chunkBrief(cues: SubtitleEntry[]): string {
  return cues
    .map((cue) => cue.text.trim())
    .filter(Boolean)
    .join(' ');
}

export interface SceneBalanceReport {
  storyboard: StoryboardPlan;
  splitScenes: number;
  addedScenes: number;
  maxSceneFrames: number;
}

/**
 * Scenes are split at measured cue starts, so their frame boundaries always line
 * up with the caption they begin speaking. The first part keeps the original
 * visual; later parts are left intentionally bare so `ensureSceneVisuals` and
 * the scene director can build a visual from their own narration.
 */
export function splitOversizedScenes(
  plan: StoryboardPlan,
  subtitles: SubtitleEntry[],
  maxSceneFrames = DEFAULT_MAX_SCENE_FRAMES,
): SceneBalanceReport {
  const fps = plan.fps;
  let splitScenes = 0;
  let addedScenes = 0;

  const scenes: SceneInstruction[] = [];

  for (const scene of plan.scenes) {
    const duration = scene.endFrame - scene.startFrame;
    const cues = subtitles
      .filter((cue) => cue.endMs > sceneStartMs(scene, fps) && cue.startMs < sceneEndMs(scene, fps))
      .sort((a, b) => a.startMs - b.startMs);

    if (duration <= maxSceneFrames || cues.length < 2) {
      scenes.push(scene);
      continue;
    }

    const groups = groupCues(scene, cues, fps, maxSceneFrames);
    if (groups.length < 2) {
      scenes.push(scene);
      continue;
    }

    const ends = groups.map((group, index) =>
      index === groups.length - 1
        ? scene.endFrame
        : Math.round((groups[index + 1]?.startMs ?? group.endMs) / 1000 * fps),
    );
    const starts = groups.map((group, index) =>
      index === 0 ? scene.startFrame : Math.round(group.startMs / 1000 * fps),
    );

    const reusable: SceneChild[] = (scene.children ?? []).filter(
      (child) => child.component !== 'EndScreen' && child.component !== 'Subtitle',
    );
    const endScreen = scene.children?.find((child) => child.component === 'EndScreen');

    groups.forEach((group, index) => {
      const startFrame = starts[index] ?? scene.startFrame;
      const endFrame = ends[index] ?? scene.endFrame;
      if (endFrame - startFrame < MIN_PART_FRAMES) return;

      const isLast = index === groups.length - 1;
      const children: SceneChild[] = [];
      // The first part may keep the model's own visual; every later part gets a
      // visual generated from its own narration instead of a duplicated graphic.
      if (index === 0) children.push(...reusable);
      if (isLast && endScreen) children.push(endScreen);

      const text = chunkBrief(group.cues);
      scenes.push({
        ...scene,
        id: `${scene.id}-part-${index + 1}`,
        startFrame,
        endFrame,
        ...(isLast ? { purpose: 'ending' } : {}),
        visualBrief: text || scene.visualBrief,
        keyTerms: undefined,
        assetQueries: undefined,
        animationIntent: undefined,
        children,
      });
    });

    splitScenes++;
    addedScenes += Math.max(0, groups.length - 1);
  }

  if (splitScenes === 0) {
    return { storyboard: plan, splitScenes: 0, addedScenes: 0, maxSceneFrames };
  }

  const renumbered = scenes.map((scene, index) => ({ ...scene, id: `scene-${index + 1}` }));
  console.warn(
    `[Storyboard] Split ${splitScenes} oversized scene(s) into ` +
      `${renumbered.length} scenes (max ${maxSceneFrames} frames each; +${addedScenes} scene(s))`,
  );

  return {
    storyboard: { ...plan, scenes: renumbered },
    splitScenes,
    addedScenes,
    maxSceneFrames,
  };
}
