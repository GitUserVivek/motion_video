import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAssetVerifyMode } from '../config.js';
import { AssetJudge, type AssetJudgeChat } from '../services/asset.judge.js';
import type { MatchedAsset } from '../services/asset.library.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edumotion-judge-'));

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });
});

function cachePath(name: string): string {
  return path.join(tempDir, `${name}.json`);
}

function asset(id: string, tokens: string[]): MatchedAsset {
  return { id, dataUrl: 'data:image/png;base64,x', tokens };
}

const ambiguous = asset('auto/heart-pumping-photograph-1234.png', ['heart', 'pumping', 'photograph']);
const plain = asset('auto/cube-1234.svg', ['cube']);
const spacecraft = asset('auto/mars-cube-one-1234.jpg', ['mars', 'cube', 'one']);

const context = {
  keyTerms: ['heart', 'blood', 'pump'],
  label: 'Heart',
  narration: 'The heart pumps blood around the body.',
  sceneId: 'scene-2',
};

function judgeWith(
  mode: 'auto' | 'llm' | 'tags',
  chat: AssetJudgeChat,
  file: string,
  modelAvailable = true,
): AssetJudge {
  return new AssetJudge({
    mode,
    cachePath: cachePath(file),
    modelAvailable: () => modelAvailable,
    chat,
  });
}

describe('parseAssetVerifyMode', () => {
  it('accepts the three modes and defaults everything else to auto', () => {
    expect(parseAssetVerifyMode(undefined)).toBe('auto');
    expect(parseAssetVerifyMode('')).toBe('auto');
    expect(parseAssetVerifyMode('tags')).toBe('tags');
    expect(parseAssetVerifyMode('LLM')).toBe('llm');
    expect(parseAssetVerifyMode('auto')).toBe('auto');
    expect(parseAssetVerifyMode('something-else')).toBe('auto');
  });
});

describe('AssetJudge', () => {
  it('tags mode is deterministic and never calls the model', async () => {
    const chat = vi.fn<AssetJudgeChat>();
    const verdict = await judgeWith('tags', chat, 'tags').verify(ambiguous, context);

    expect(verdict.accepted).toBe(true);
    expect(verdict.source).toBe('tags');
    expect(chat).not.toHaveBeenCalled();
  });

  it('auto mode skips the model for a confident verdict', async () => {
    const chat = vi.fn<AssetJudgeChat>();
    const verdict = await judgeWith('auto', chat, 'confident').verify(plain, {
      keyTerms: ['cube', 'shape', 'face'],
      label: 'Cube',
    });

    expect(verdict.accepted).toBe(true);
    expect(verdict.source).toBe('tags');
    expect(chat).not.toHaveBeenCalled();
  });

  it('auto mode asks the model for an ambiguous one-word match and can reject it', async () => {
    const chat = vi.fn<AssetJudgeChat>().mockResolvedValue(
      '{"match": false, "reason": "an anatomy chart, not the pump described"}',
    );
    const verdict = await judgeWith('auto', chat, 'ambiguous').verify(ambiguous, context);

    expect(chat).toHaveBeenCalledTimes(1);
    expect(verdict.accepted).toBe(false);
    expect(verdict.source).toBe('llm');
    expect(verdict.reason).toMatch(/LLM rejected: an anatomy chart/);
  });

  it('caches a judgement by content hash so a repeat costs no model call', async () => {
    const firstChat = vi.fn<AssetJudgeChat>().mockResolvedValue(
      '{"match": true, "reason": "a labelled heart diagram"}',
    );
    const first = await judgeWith('auto', firstChat, 'cached').verify(ambiguous, context);
    expect(first.source).toBe('llm');
    expect(first.accepted).toBe(true);

    const secondChat = vi.fn<AssetJudgeChat>();
    const second = await judgeWith('auto', secondChat, 'cached').verify(ambiguous, context);

    expect(secondChat).not.toHaveBeenCalled();
    expect(second.source).toBe('cache');
    expect(second.accepted).toBe(true);
  });

  it('never lets the model overturn a deterministic subject-field rejection', async () => {
    const chat = vi.fn<AssetJudgeChat>();
    const verdict = await judgeWith('llm', chat, 'conflict').verify(spacecraft, {
      keyTerms: ['cube', 'shape', 'face'],
      label: 'Cube',
    });

    expect(chat).not.toHaveBeenCalled();
    expect(verdict.accepted).toBe(false);
    expect(verdict.source).toBe('tags');
    expect(verdict.conflicts).toContain('space');
  });

  it('llm mode falls back to deterministic tags when no model is available', async () => {
    const chat = vi.fn<AssetJudgeChat>();
    const verdict = await judgeWith('llm', chat, 'no-model', false).verify(ambiguous, context);

    expect(chat).not.toHaveBeenCalled();
    expect(verdict.source).toBe('tags');
    expect(verdict.accepted).toBe(true);
  });

  it('stops consulting the model after repeated unusable replies', async () => {
    const chat = vi.fn(async () => 'I think this image is fine.');
    const judge = judgeWith('auto', chat, 'breaker');
    const ids = ['1111', '2222', '3333', '4444'].map((suffix) => asset(
      `auto/heart-pumping-photograph-${suffix}.png`,
      ['heart', 'pumping', 'photograph'],
    ));

    for (const candidate of ids.slice(0, 3)) {
      await judge.verify(candidate, context);
    }
    const afterThreshold = await judge.verify(ids[3]!, context);

    expect(chat).toHaveBeenCalledTimes(3);
    expect(afterThreshold.source).toBe('tags');
    expect(afterThreshold.accepted).toBe(true);
  });

  it('falls back to the deterministic verdict on malformed or failing replies', async () => {
    const malformed = await judgeWith(
      'llm',
      vi.fn<AssetJudgeChat>().mockResolvedValue('not json'),
      'malformed',
    ).verify(ambiguous, context);
    expect(malformed.source).toBe('tags');
    expect(malformed.accepted).toBe(true);

    const failing = await judgeWith(
      'llm',
      vi.fn<AssetJudgeChat>().mockRejectedValue(new Error('model busy')),
      'failing',
    ).verify(ambiguous, context);
    expect(failing.source).toBe('tags');
    expect(failing.accepted).toBe(true);
  });
});
