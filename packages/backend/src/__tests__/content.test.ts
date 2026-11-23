import { describe, expect, it } from 'vitest';
import type { StoryboardPlan } from '@edumotion/shared';
import { deriveContentAnalysis } from '../services/content.analysis.js';
import { verifyClaims } from '../services/fact.check.js';
import { verifyAssetMatch } from '../services/asset.verify.js';
import { validateMath } from '../services/math.check.js';

describe('deriveContentAnalysis', () => {
  it('uses the narration and does not turn one incidental word into the topic', () => {
    const script = [
      'Profit and loss are the two possible results of running a business.',
      'A profit means revenue is higher than costs.',
      'A loss means the technology was too expensive to run.',
      'The owner compares both numbers before making a decision.',
    ].join('\n');

    const analysis = deriveContentAnalysis({ script });
    expect(analysis.domain).toBe('general');
    expect(analysis.topic.toLowerCase()).toContain('profit and loss');
    expect(analysis.keyTerms.map((term) => term.term)).toEqual(
      expect.arrayContaining(['profit', 'loss']),
    );
    expect(analysis.topic.toLowerCase()).not.toBe('technology');
    expect(analysis.confidence).toBeLessThan(0.5);
  });

  it('marks numeric sentences as claims to verify', () => {
    const analysis = deriveContentAnalysis({
      script: 'Revenue grew by 12 percent this year. Costs stayed the same.',
    });
    expect(analysis.claims).toHaveLength(1);
    expect(analysis.claims[0]?.kind).toBe('percentage');
    expect(analysis.claims[0]?.status).toBe('unverified');
  });
});

describe('verifyClaims', () => {
  it('supports a claim only when the exact value appears in a source', () => {
    const result = verifyClaims(
      [{ text: 'Revenue grew 12 percent.', kind: 'percentage', value: '12 percent', status: 'unverified' }],
      [{
        provider: 'test',
        title: 'Finance',
        url: 'https://example.invalid/finance',
        extract: 'Revenue grew 12 percent last year.',
        retrievedAt: new Date().toISOString(),
      }],
    );

    expect(result.claims[0]?.status).toBe('supported');
    expect(result.supported).toBe(1);
  });

  it('leaves a claim unverified when no source contains it', () => {
    const result = verifyClaims(
      [{ text: 'Revenue grew 12 percent.', kind: 'percentage', value: '12 percent', status: 'unverified' }],
      [],
    );
    expect(result.claims[0]?.status).toBe('unverified');
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

describe('verifyAssetMatch', () => {
  it('accepts a downloaded file that names the scene terms', () => {
    const verdict = verifyAssetMatch(
      { id: 'auto/profit-loss-statement-1234.svg', dataUrl: 'data:image/svg+xml;base64,x', tokens: ['profit', 'loss', 'statement'] },
      ['profit', 'loss'],
    );
    expect(verdict.accepted).toBe(true);
    expect(verdict.matchedTerms).toEqual(expect.arrayContaining(['profit', 'loss']));
  });

  it('accepts singular/plural variants of a scene term', () => {
    const verdict = verifyAssetMatch(
      { id: 'auto/neurons-1234.svg', dataUrl: 'data:image/svg+xml;base64,x', tokens: ['neurons', 'signals'] },
      ['neuron'],
    );
    expect(verdict.accepted).toBe(true);
    expect(verdict.matchedTerms).toEqual(['neuron']);
  });

  it('rejects a backdrop or an unrelated asset', () => {
    const backdrop = verifyAssetMatch(
      { id: 'backgrounds/minimal_light.svg', dataUrl: 'data:image/svg+xml;base64,x', tokens: ['minimal', 'light'] },
      ['profit', 'loss'],
    );
    expect(backdrop.accepted).toBe(false);

    const unrelated = verifyAssetMatch(
      { id: 'auto/rocket-1234.svg', dataUrl: 'data:image/svg+xml;base64,x', tokens: ['rocket'] },
      ['profit', 'loss'],
    );
    expect(unrelated.accepted).toBe(false);
  });
});

describe('validateMath', () => {
  it('flags a displayed equation that is false', () => {
    const storyboard: StoryboardPlan = {
      jobId: 'job-1',
      totalFrames: 100,
      fps: 30,
      audioDurationMs: 3000,
      scenes: [{
        id: 'scene-1',
        startFrame: 0,
        endFrame: 100,
        component: 'BackgroundScene',
        props: {},
        children: [{ component: 'AnimatedText', props: { text: '2 + 2 = 5' } }],
      }],
    };

    expect(validateMath(storyboard)).toEqual([
      expect.objectContaining({ sceneId: 'scene-1' }),
    ]);
  });

  it('accepts a correct equation', () => {
    const storyboard: StoryboardPlan = {
      jobId: 'job-1',
      totalFrames: 100,
      fps: 30,
      audioDurationMs: 3000,
      scenes: [{
        id: 'scene-1',
        startFrame: 0,
        endFrame: 100,
        component: 'BackgroundScene',
        props: {},
        children: [{ component: 'AnimatedText', props: { text: '12 + 8 = 20' } }],
      }],
    };

    expect(validateMath(storyboard)).toEqual([]);
  });
});
