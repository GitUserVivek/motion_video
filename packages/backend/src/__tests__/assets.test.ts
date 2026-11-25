import { describe, it, expect } from 'vitest';
import type { SceneInstruction } from '@edumotion/shared';
import {
  buildAssetQueries,
  buildSceneAssetQueries,
  isConfidentCandidate,
  nasaPreviewUrl,
  parseRetryAfterMs,
  retryDelayMs,
  sanitizeSvg,
  selectWikimediaThumbnailUrl,
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

describe('selectWikimediaThumbnailUrl', () => {
  it('keeps a generated thumbnail URL', () => {
    const thumb = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/file.jpg/640px-file.jpg';
    expect(selectWikimediaThumbnailUrl('File:file.jpg', { thumburl: thumb })).toBe(thumb);
  });

  it('replaces an unscaled original URL with a small thumbnail', () => {
    expect(
      selectWikimediaThumbnailUrl('File:Combustion Chamber.png', {
        thumburl: 'https://upload.wikimedia.org/wikipedia/commons/b/bc/Combustion_Chamber.png?utm_content=thumbnail_unscaled',
        url: 'https://upload.wikimedia.org/wikipedia/commons/b/bc/Combustion_Chamber.png?utm_content=original',
        width: 526,
      }),
    ).toBe('https://commons.wikimedia.org/wiki/Special:FilePath/Combustion_Chamber.png?width=320');
  });

  it('rejects an original too small to thumbnail', () => {
    expect(
      selectWikimediaThumbnailUrl('File:tiny.png', {
        thumburl: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/tiny.png',
        width: 300,
      }),
    ).toBeNull();
  });
});

describe('nasaPreviewUrl', () => {
  const base = 'https://images-assets.nasa.gov/image/PIA14417/PIA14417';

  it('picks a web rendition instead of the original upload', () => {
    expect(
      nasaPreviewUrl([`${base}~orig.jpg`, `${base}~small.jpg`, `${base}~thumb.jpg`]),
    ).toBe(`${base}~small.jpg`);
  });

  it('rewrites an original when it is the only rendition offered', () => {
    expect(nasaPreviewUrl([`${base}~orig.jpg`])).toBe(`${base}~small.jpg`);
  });

  it('ignores non-JPEG links and an empty result', () => {
    expect(nasaPreviewUrl([`${base}~small.png`, `${base}~orig.jpg`])).toBe(`${base}~small.jpg`);
    expect(nasaPreviewUrl([])).toBeNull();
  });
});

describe('rate-limit backoff', () => {
  it('reads Retry-After as seconds or an HTTP date', () => {
    expect(parseRetryAfterMs('7')).toBe(7000);
    expect(parseRetryAfterMs(null)).toBeNull();
    expect(parseRetryAfterMs('soon')).toBeNull();

    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(parseRetryAfterMs('Thu, 01 Jan 2026 00:00:30 GMT', now)).toBe(30_000);
    expect(parseRetryAfterMs('Thu, 01 Jan 2020 00:00:00 GMT', now)).toBe(0);
  });

  it('honours Retry-After and keeps exponential backoff bounded', () => {
    expect(retryDelayMs(1, 2000)).toBe(2000);
    expect(retryDelayMs(3, 120_000)).toBe(15_000);

    const first = retryDelayMs(1, null, () => 0.5);
    const third = retryDelayMs(3, null, () => 0.5);
    expect(first).toBeLessThan(third);
    expect(third).toBeLessThanOrEqual(15_000);
    expect(retryDelayMs(9, null, () => 0.5)).toBeLessThanOrEqual(15_000);
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

describe('isConfidentCandidate', () => {
  const base = {
    provider: 'wikimedia' as const,
    id: 'File:test.png',
    name: 'test',
    tags: ['diagram'],
    format: 'png' as const,
    url: 'https://example.invalid/test.png',
    license: { name: 'CC BY-SA 4.0' },
  };

  it('rejects a single generic word from a two-word query', () => {
    expect(
      isConfidentCandidate(
        { ...base, name: 'Layered depressions', tags: ['mars', 'space'] },
        'layered processing',
      ),
    ).toBe(false);
  });

  it('accepts singular and plural forms of the same concept', () => {
    expect(
      isConfidentCandidate(
        { ...base, name: 'Neural network architecture', tags: ['artificial intelligence'] },
        'neural networks',
      ),
    ).toBe(true);
  });

  it('matches simple verb and adjective forms of the same word', () => {
    expect(
      isConfidentCandidate(
        { ...base, name: 'Layer process', tags: [] },
        'layered processing',
      ),
    ).toBe(true);
  });

  it('requires at least two real hits for longer queries', () => {
    expect(
      isConfidentCandidate(
        { ...base, name: 'Neuron message passing', tags: [] },
        'neuron message passing diagram',
      ),
    ).toBe(true);
    expect(
      isConfidentCandidate(
        { ...base, name: 'Neuron cell', tags: [] },
        'neuron message passing diagram',
      ),
    ).toBe(false);
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
