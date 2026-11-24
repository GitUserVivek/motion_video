import { describe, expect, it } from 'vitest';
import type { StoryboardPlan } from '@edumotion/shared';
import { pickUserAsset, scoreUserAsset } from '../services/user.asset.match.js';
import { attachSceneArtwork } from '../services/storyboard.visuals.js';
import type { UserAsset } from '../services/user.asset.service.js';

const cube = {
  id: 'cube-1',
  fileName: 'cube.png',
  caption: 'A cube with labelled faces and edges',
  keywords: ['cube', 'faces', 'edges'],
};

const pyramid = {
  id: 'pyramid-1',
  fileName: 'pyramid.png',
  caption: 'A square pyramid',
  keywords: ['pyramid', 'square base'],
};

describe('user asset matching', () => {
  it('scores an uploaded cube for a cube scene', () => {
    expect(scoreUserAsset(cube, {
      text: 'A cube has six faces and twelve edges.',
      keyTerms: ['cube', 'faces', 'edges'],
      label: 'Cube',
    })).toBeGreaterThanOrEqual(3);
  });

  it('does not force an unrelated upload into a scene', () => {
    const satellite = {
      id: 'satellite-1',
      fileName: 'satellite.png',
      caption: 'A satellite in orbit',
      keywords: ['satellite', 'space'],
    };
    expect(pickUserAsset(
      [satellite],
      { text: 'A cube has six faces.', keyTerms: ['cube', 'faces'], label: 'Cube' },
      new Set(),
    )).toBeNull();
  });

  it('does not reuse the same user image twice', () => {
    expect(pickUserAsset(
      [cube],
      { text: 'Cube faces', keyTerms: ['cube', 'faces'], label: 'Cube' },
      new Set(['cube-1']),
    )).toBeNull();
  });
});

describe('attachSceneArtwork with uploaded images', () => {
  it('puts uploaded cube and pyramid images on the matching comparison sides', async () => {
    const storyboard = {
      jobId: 'job-1',
      totalFrames: 192,
      fps: 30,
      audioDurationMs: 6400,
      scenes: [{
        id: 'scene-1',
        startFrame: 0,
        endFrame: 192,
        component: 'BackgroundScene',
        props: {},
        visualBrief: 'A cube compared with a pyramid',
        keyTerms: ['cube', 'pyramid'],
        children: [{
          component: 'SplitScreenComparison',
          props: {
            left: { content: 'Cube: 6 faces, 12 edges, 8 vertices' },
            right: { content: 'Pyramid: 5 faces, 8 edges, 5 vertices' },
          },
        }],
      }],
    } as unknown as StoryboardPlan;

    const assets: UserAsset[] = [cube, pyramid].map((asset) => ({
      id: asset.id,
      fileName: asset.fileName,
      mimeType: 'image/png',
      caption: asset.caption,
      keywords: asset.keywords,
      dataUrl: `data:image/png;base64,${asset.id}`,
      assetPath: `user/${asset.id}`,
    }));

    const result = await attachSceneArtwork(storyboard, undefined, assets);
    const comparison = result.storyboard.scenes[0]?.children?.[0];
    expect(comparison?.component).toBe('SplitScreenComparison');
    expect((comparison?.props['left'] as { image?: string }).image).toContain('cube-1');
    expect((comparison?.props['right'] as { image?: string }).image).toContain('pyramid-1');
    expect(result.assetUses.filter((use) => use.source === 'user')).toHaveLength(2);
  });
});
