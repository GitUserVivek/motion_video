import { describe, expect, it } from 'vitest';
import { captionVerdict } from '../services/vision.service.js';

const geometry = { label: 'कोन (angle)', keyTerms: ['त्रिकोण', 'triangle', 'right angle'] };

describe('captionVerdict', () => {
  it('accepts a picture the model described with one of the needed concepts', () => {
    const verdict = captionVerdict(
      'The image features a black and white diagram of a triangle labelled a, b and c.',
      geometry,
    );

    expect(verdict?.match).toBe(true);
    expect(verdict?.reason).toMatch(/it shows triangle/);
  });

  it('rejects a picture whose description names none of them', () => {
    const verdict = captionVerdict(
      'A colourful mural painted on a brick wall beside a doorway, showing a cartoon creature.',
      geometry,
    );

    expect(verdict?.match).toBe(false);
    expect(verdict?.reason).toMatch(/it shows something else/);
  });

  it('matches inflected forms of the same word', () => {
    const verdict = captionVerdict('Two angles meet at a labelled right corner.', geometry);
    expect(verdict?.match).toBe(true);
  });

  it('returns null when the reply is empty or names no concepts', () => {
    expect(captionVerdict('', geometry)).toBeNull();
    expect(captionVerdict('   ', geometry)).toBeNull();
    expect(captionVerdict('a diagram', { label: 'कोन' })).toBeNull();
  });
});
