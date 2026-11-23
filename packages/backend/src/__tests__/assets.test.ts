import { describe, it, expect } from 'vitest';
import type { SceneInstruction } from '@edumotion/shared';
import {
  buildAssetQueries,
  buildSceneAssetQueries,
  sanitizeSvg,
  scoreAssetCandidate,
  slugify,
  stripHtml,
  tokenizeText,
} from '../services/asset.discovery.js';

describe('slugify', () => {
  it('produces a stable file-name-safe slug', () => {
    expect(slugify('How Does the Heart Work?')).toBe('how-does-the-heart-work');
    expect(slugify('  Carbon dioxide / glucose  ')).toBe('carbon-dioxide-glucose');
    expect(slugify('???')).toBe('');
  });
});

describe('buildAssetQueries', () => {
  it('searches for the concepts a topic is actually about', () => {
    const queries = buildAssetQueries(
      'Photosynthesis lets plants turn sunlight, water and carbon dioxide into glucose and oxygen.',
      5,
    );

    expect(queries.length).toBeGreaterThan(0);
    expect(queries.length).toBeLessThanOrEqual(5);
    expect(queries.join(' ')).toMatch(/photosynthesis|sunlight|carbon dioxide|glucose|oxygen/);
  });

  it('never returns stopwords or duplicates', () => {
    const queries = buildAssetQueries(
      'The heart pumps the blood through the body. The heart never stops.',
      6,
    );

    expect(queries.some((query) => /^(the|and|with|through)$/.test(query))).toBe(false);
    expect(new Set(queries.map((query) => slugify(query))).size).toBe(queries.length);
  });

  it('respects the query budget and handles an empty script', () => {
    expect(buildAssetQueries('', 4)).toEqual([]);
    expect(buildAssetQueries('A computer processes instructions quickly.', 2).length).toBeLessThanOrEqual(2);
  });
});

describe('buildSceneAssetQueries', () => {
  const captionScene = {
    id: 'scene-1',
    component: 'AnimatedText',
    props: {},
    children: [
      {
        component: 'Subtitle',
        props: {
          entries: [
            {
              index: 0,
              startMs: 0,
              endMs: 1000,
              text: 'A solar panel turns sunlight into electricity.',
            },
          ],
        },
      },
    ],
  } as unknown as SceneInstruction;

  it('derives searches from the scene caption when the model supplied none', () => {
    const queries = buildSceneAssetQueries(captionScene, 3);
    expect(queries.join(' ')).toMatch(/solar|sunlight|electricity/);
    expect(queries.length).toBeLessThanOrEqual(3);
  });

  it('keeps explicit scene queries first', () => {
    const queries = buildSceneAssetQueries(
      {
        ...captionScene,
        assetQueries: ['solar panel'],
        keyTerms: ['renewable energy'],
      } as SceneInstruction,
      3,
    );
    expect(queries[0]).toBe('solar panel');
  });
});

describe('sanitizeSvg', () => {
  it('strips scripts, event handlers and remote references', () => {
    const dirty = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" onload="alert(1)">',
      '<script>alert(2)</script>',
      '<image href="https://example.com/tracker.png"/>',
      '<a href="javascript:alert(3)"><rect fill="url(#grad)" width="5" height="5"/></a>',
      '</svg>',
    ].join('');

    const clean = sanitizeSvg(dirty);

    expect(clean).not.toBeNull();
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('onload');
    expect(clean).not.toContain('javascript:');
    expect(clean).not.toContain('example.com');
    // Local paint references must survive, otherwise gradients disappear.
    expect(clean).toContain('url(#grad)');
  });

  it('rejects files that are not SVG', () => {
    expect(sanitizeSvg('<html><body>nope</body></html>')).toBeNull();
    expect(sanitizeSvg('')).toBeNull();
  });
});

describe('scoreAssetCandidate', () => {
  const base = {
    provider: 'iconify' as const,
    id: 'mdi:leaf',
    name: 'leaf',
    tags: ['plant', 'nature'],
    format: 'svg' as const,
    url: 'https://example.invalid/leaf.svg',
    license: { name: 'Apache-2.0' },
  };

  it('prefers the candidate that covers the query', () => {
    const relevant = scoreAssetCandidate(base, 'leaf');
    const unrelated = scoreAssetCandidate(
      { ...base, id: 'mdi:rocket', name: 'rocket', tags: ['space'] },
      'leaf',
    );

    expect(relevant).toBeGreaterThan(unrelated);
    expect(relevant).toBeLessThanOrEqual(1.2);
  });

  it('returns zero when the query has no meaningful words', () => {
    expect(scoreAssetCandidate(base, 'the and of')).toBe(0);
  });

  it('rewards colourful artwork from a colour-first provider', () => {
    const colorful = scoreAssetCandidate(
      { ...base, provider: 'openmoji', id: '1F331', colorful: true },
      'leaf',
    );
    expect(colorful).toBeGreaterThan(scoreAssetCandidate(base, 'leaf'));
  });
});

describe('helpers', () => {
  it('tokenizes without stopwords', () => {
    expect(tokenizeText('The Heart pumps blood')).toEqual(['heart', 'pumps', 'blood']);
  });

  it('cleans HTML out of Wikimedia metadata', () => {
    expect(stripHtml('<a href="x">Jane Doe</a> &amp; friends')).toBe('Jane Doe friends');
  });
});
