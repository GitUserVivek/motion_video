import { describe, expect, it } from 'vitest';
import type { StoryboardPlan } from '@edumotion/shared';
import { deriveContentAnalysis } from '../services/content.analysis.js';
import { verifyClaims } from '../services/fact.check.js';
import { verifyAssetMatch } from '../services/asset.verify.js';
import { isBalancedChemicalEquation, validateMath } from '../services/math.check.js';

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

  it('rejects a candidate from a different subject area even when one word matches', () => {
    // A spacecraft called "Mars Cube One" is not a geometric cube.
    const spacecraft = verifyAssetMatch(
      {
        id: 'auto/mars-cube-one-1234.jpg',
        dataUrl: 'data:image/jpeg;base64,x',
        tokens: ['mars', 'cube', 'one'],
      },
      ['cube', 'shape', 'square', 'face'],
    );
    expect(spacecraft.accepted).toBe(false);
    expect(spacecraft.conflicts).toContain('space');
    expect(spacecraft.matchedTerms).toContain('cube');

    // A workplace "hierarchy of control" chart is not a geometric solid.
    const safetyChart = verifyAssetMatch(
      {
        id: 'auto/hierarchy-of-control-pyramid-1234.png',
        dataUrl: 'data:image/png;base64,x',
        tokens: ['hierarchy', 'control', 'pyramid'],
      },
      ['pyramid', 'shape', 'base', 'triangle'],
    );
    expect(safetyChart.accepted).toBe(false);
    expect(safetyChart.conflicts).toContain('safety');
  });

  it('accepts a plain illustration that names the scene concept', () => {
    const verdict = verifyAssetMatch(
      { id: 'auto/cube-1234.svg', dataUrl: 'data:image/svg+xml;base64,x', tokens: ['cube'] },
      ['cube', 'shape', 'face'],
    );
    expect(verdict.accepted).toBe(true);
    expect(verdict.conflicts).toEqual([]);
  });

  it('keeps a field asset when the scene itself discusses that field', () => {
    const verdict = verifyAssetMatch(
      {
        id: 'auto/satellite-1234.jpg',
        dataUrl: 'data:image/jpeg;base64,x',
        tokens: ['satellite', 'orbit'],
      },
      ['satellite', 'orbit', 'earth'],
    );
    expect(verdict.accepted).toBe(true);
  });

  it('keeps a plant diagram in a photosynthesis scene', () => {
    const verdict = verifyAssetMatch(
      {
        id: 'auto/plant-cell-structure-en-881bbed3.png',
        dataUrl: 'data:image/png;base64,x',
        tokens: ['plant', 'cell', 'structure', 'en'],
      },
      ['plants', 'glucose', 'oxygen', 'sunlight', 'chlorophyll', 'carbon', 'dioxide'],
    );
    expect(verdict.accepted).toBe(true);
    expect(verdict.conflicts).toEqual([]);
  });

  it('rejects a candidate whose field conflicts with the label and narration', () => {
    const verdict = verifyAssetMatch(
      {
        id: 'auto/widget-anatomy-1234.png',
        dataUrl: 'data:image/png;base64,x',
        tokens: ['widget', 'anatomy'],
      },
      ['widget'],
      'Revenue and profit for the quarter',
    );
    expect(verdict.accepted).toBe(false);
    expect(verdict.conflicts).toContain('biology');
  });

  it('does not invent a field conflict when the scene names no subject field', () => {
    const verdict = verifyAssetMatch(
      {
        id: 'auto/widget-anatomy-1234.png',
        dataUrl: 'data:image/png;base64,x',
        tokens: ['widget', 'anatomy'],
      },
      ['widget'],
    );
    expect(verdict.accepted).toBe(true);
    expect(verdict.conflicts).toEqual([]);
  });
});

describe('chemical equations', () => {
  it('accepts a balanced formula and rejects a word or unbalanced one', () => {
    expect(isBalancedChemicalEquation('6CO2 + 6H2O -> C6H12O6 + 6O2')).toBe(true);
    expect(isBalancedChemicalEquation('CO2 + H2O -> glucose + O2')).toBe(false);
    expect(isBalancedChemicalEquation('CO2 -> CO')).toBe(false);
    expect(isBalancedChemicalEquation('12 + 8 = 20')).toBeNull();
  });

  it('flags an unbalanced equation on screen', () => {
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
        children: [{
          component: 'AnimatedDiagram',
          props: { equation: 'CO2 + H2O -> glucose + O2' },
        }],
      }],
    };

    expect(validateMath(storyboard)).toEqual([
      expect.objectContaining({ sceneId: 'scene-1', message: expect.stringContaining('not balanced') }),
    ]);
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
