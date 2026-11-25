import { describe, expect, it, vi } from 'vitest';
import type { MatchedAsset } from '../services/asset.library.js';
import { pickVerifiedMatch } from '../services/storyboard.visuals.js';

const context = {
  label: 'Cube',
  keyTerms: ['cube', 'faces'],
  narration: 'A cube has six square faces.',
};

function candidate(id: string): MatchedAsset {
  return { id, dataUrl: `data:image/svg+xml;base64,${Buffer.from(id).toString('base64')}`, tokens: ['cube'] };
}

function judgeReturning(...verdicts: boolean[]): { verify: ReturnType<typeof vi.fn> } {
  let index = 0;
  return {
    verify: vi.fn(async () => {
      const accepted = verdicts[Math.min(index, verdicts.length - 1)] ?? false;
      index++;
      return {
        accepted,
        reason: accepted ? 'Matches scene term(s): cube' : 'the picture is a museum painting',
        matchedTerms: accepted ? ['cube'] : [],
        conflicts: [],
        source: 'llm' as const,
      };
    }),
  };
}

describe('pickVerifiedMatch', () => {
  it('keeps the first candidate the verifier accepts', async () => {
    const judge = judgeReturning(true);
    const result = await pickVerifiedMatch([candidate('auto/cube-1.svg')], context, judge as never);

    expect(result.match?.id).toBe('auto/cube-1.svg');
    expect(result.rejections).toHaveLength(0);
    expect(judge.verify).toHaveBeenCalledTimes(1);
  });

  it('moves on to the next candidate instead of losing the tile', async () => {
    const judge = judgeReturning(false, true);
    const result = await pickVerifiedMatch(
      [candidate('auto/geometric-enhancements.jpg'), candidate('auto/cube-2.svg')],
      context,
      judge as never,
    );

    expect(judge.verify).toHaveBeenCalledTimes(2);
    expect(result.match?.id).toBe('auto/cube-2.svg');
    expect(result.rejections).toEqual([
      { asset: 'auto/geometric-enhancements.jpg', reason: 'the picture is a museum painting' },
    ]);
  });

  it('reports every rejection when nothing passes', async () => {
    const judge = judgeReturning(false, false);
    const result = await pickVerifiedMatch(
      [candidate('auto/a.jpg'), candidate('auto/b.jpg')],
      context,
      judge as never,
    );

    expect(result.match).toBeNull();
    expect(result.rejections.map((item) => item.asset)).toEqual(['auto/a.jpg', 'auto/b.jpg']);
  });

  it('never calls the verifier when no artwork matches', async () => {
    const judge = judgeReturning(true);
    const result = await pickVerifiedMatch([], context, judge as never);

    expect(judge.verify).not.toHaveBeenCalled();
    expect(result.match).toBeNull();
  });
});
