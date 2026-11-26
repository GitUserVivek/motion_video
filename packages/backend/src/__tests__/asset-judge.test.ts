import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAssetVerifyMode } from '../config.js';
import { AssetJudge, type AssetAudit } from '../services/asset.judge.js';
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
  mode: 'auto' | 'vision' | 'tags',
  audit: AssetAudit,
  file: string,
  visionAvailable = true,
): AssetJudge {
  return new AssetJudge({
    mode,
    cachePath: cachePath(file),
    audit,
    visionAvailable: () => visionAvailable,
  });
}

describe('parseAssetVerifyMode', () => {
  it('accepts the modes, maps the legacy llm value to vision and defaults to auto', () => {
    expect(parseAssetVerifyMode(undefined)).toBe('auto');
    expect(parseAssetVerifyMode('')).toBe('auto');
    expect(parseAssetVerifyMode('tags')).toBe('tags');
    expect(parseAssetVerifyMode('vision')).toBe('vision');
    expect(parseAssetVerifyMode('auto')).toBe('auto');
    // Artwork is no longer judged by the script model.
    expect(parseAssetVerifyMode('LLM')).toBe('vision');
    expect(parseAssetVerifyMode('something-else')).toBe('auto');
  });
});

describe('AssetJudge', () => {
  it('tags mode is deterministic and never calls the vision model', async () => {
    const audit = vi.fn<AssetAudit>();
    const verdict = await judgeWith('tags', audit, 'tags').verify(ambiguous, context);

    expect(verdict.accepted).toBe(true);
    expect(verdict.source).toBe('tags');
    expect(audit).not.toHaveBeenCalled();
  });

  it('asks the vision model to look at the picture, even for a confident file name', async () => {
    const audit = vi.fn<AssetAudit>(async () => ({ match: true, reason: 'a real cube with visible faces' }));
    const verdict = await judgeWith('auto', audit, 'vision-accept').verify(plain, {
      keyTerms: ['cube', 'shape', 'face'],
      label: 'Cube',
    });

    expect(audit).toHaveBeenCalledTimes(1);
    expect(verdict.accepted).toBe(true);
    expect(verdict.source).toBe('vision');
    expect(verdict.reason).toMatch(/Vision accepted: a real cube/);
  });

  it('lets the vision model reject a file whose name matches but whose picture does not', async () => {
    const audit = vi.fn<AssetAudit>(async () => ({
      match: false,
      reason: 'a museum painting, no cube in the picture',
    }));
    const verdict = await judgeWith('auto', audit, 'vision-reject').verify(plain, {
      keyTerms: ['cube', 'shape', 'face'],
      label: 'Cube',
    });

    expect(verdict.accepted).toBe(false);
    expect(verdict.source).toBe('vision');
    expect(verdict.reason).toMatch(/Vision rejected: a museum painting/);
  });

  it('rejects artwork on the file-name rules alone when no vision endpoint is set', async () => {
    const audit = vi.fn<AssetAudit>();
    const verdict = await judgeWith('auto', audit, 'no-vision', false).verify(ambiguous, context);

    expect(audit).not.toHaveBeenCalled();
    expect(verdict.accepted).toBe(true);
    expect(verdict.source).toBe('tags');
  });

  it('keeps the deterministic verdict when the vision model cannot answer', async () => {
    const audit = vi.fn<AssetAudit>(async () => null);
    const verdict = await judgeWith('vision', audit, 'vision-unavailable').verify(plain, {
      keyTerms: ['cube', 'shape', 'face'],
      label: 'Cube',
    });

    expect(audit).toHaveBeenCalledTimes(1);
    expect(verdict.source).toBe('tags');
    expect(verdict.accepted).toBe(true);
  });

  it('never lets the vision model overturn a deterministic subject-field rejection', async () => {
    const audit = vi.fn<AssetAudit>(async () => ({ match: true, reason: 'a cube' }));
    const verdict = await judgeWith('vision', audit, 'conflict').verify(spacecraft, {
      keyTerms: ['cube', 'shape', 'face'],
      label: 'Cube',
    });

    expect(audit).not.toHaveBeenCalled();
    expect(verdict.accepted).toBe(false);
    expect(verdict.source).toBe('tags');
    expect(verdict.conflicts).toContain('space');
  });

  it('caches a vision verdict by model so a repeat costs no model call', async () => {
    const firstAudit = vi.fn<AssetAudit>(async () => ({ match: false, reason: 'no cube' }));
    const first = await judgeWith('auto', firstAudit, 'vision-cache').verify(plain, {
      keyTerms: ['cube'],
      label: 'Cube',
    });
    expect(first.source).toBe('vision');
    expect(first.accepted).toBe(false);

    const repeatedAudit = vi.fn<AssetAudit>(async () => ({ match: true, reason: 'a cube' }));
    const second = await judgeWith('auto', repeatedAudit, 'vision-cache').verify(plain, {
      keyTerms: ['cube'],
      label: 'Cube',
    });

    expect(repeatedAudit).not.toHaveBeenCalled();
    expect(second.source).toBe('cache');
    expect(second.accepted).toBe(false);
  });
});
