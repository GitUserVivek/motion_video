import type { StoryboardPlan, SubtitleEntry } from '@edumotion/shared';

export interface SubtitleIssue {
  sceneId?: string;
  severity: 'blocking' | 'warning';
  message: string;
}

function sceneEntries(storyboard: StoryboardPlan): Map<string, SubtitleEntry[]> {
  const map = new Map<string, SubtitleEntry[]>();
  for (const scene of storyboard.scenes) {
    const entries = (scene.children ?? [])
      .filter((child) => child.component === 'Subtitle')
      .flatMap((child) => (Array.isArray(child.props['entries'])
        ? (child.props['entries'] as SubtitleEntry[])
        : []));
    map.set(scene.id, entries);
  }
  return map;
}

/**
 * Validate caption placement after scene injection. A cue that appears whole in
 * two adjacent scenes is the classic boundary bug this catches; overlapping
 * cues inside one scene and timestamps outside the audio are also blocking.
 */
export function validateSubtitles(
  storyboard: StoryboardPlan,
  audioDurationMs: number,
): SubtitleIssue[] {
  const issues: SubtitleIssue[] = [];
  const byScene = sceneEntries(storyboard);
  const seen = new Map<string, string>();

  for (const [sceneId, entries] of byScene) {
    const sorted = [...entries].sort((a, b) => a.startMs - b.startMs);

    for (let i = 0; i < sorted.length; i++) {
      const cue = sorted[i];
      if (!cue) continue;
      if (!Number.isFinite(cue.startMs) || !Number.isFinite(cue.endMs) || cue.endMs <= cue.startMs) {
        issues.push({ sceneId, severity: 'blocking', message: `Invalid subtitle range: ${cue.text}` });
      }
      if (cue.startMs < 0 || cue.endMs > audioDurationMs + 1) {
        issues.push({
          sceneId,
          severity: 'blocking',
          message: `Subtitle "${cue.text}" is outside the audio duration.`,
        });
      }

      const previous = sorted[i - 1];
      if (previous && cue.startMs < previous.endMs - 1) {
        issues.push({
          sceneId,
          severity: 'blocking',
          message: `Overlapping captions: "${previous.text}" and "${cue.text}".`,
        });
      }

      const key = cue.text.trim().toLowerCase();
      if (key.length > 0) {
        const previousScene = seen.get(key);
        if (previousScene && previousScene !== sceneId) {
          issues.push({
            sceneId,
            severity: 'blocking',
            message: `Caption is duplicated in ${previousScene}: "${cue.text}".`,
          });
        }
        seen.set(key, sceneId);
      }
    }
  }

  return issues;
}
