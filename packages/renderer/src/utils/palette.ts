import { PALETTE_IDS, pickScenePalette, type PaletteId } from '@edumotion/shared';

/**
 * Colour direction for the video.
 *
 * The ids and the "which palette for this scene" rule live in shared code, so
 * the backend director and the renderer cannot drift apart. This file only adds
 * the actual paint: gradients that stay colourful while keeping white headings
 * and captions readable, plus the accent colours used by decorative shapes.
 */

export { PALETTE_IDS, pickScenePalette };
export type { PaletteId };

export interface PaletteStyle {
  /** Background gradient painted behind every scene. */
  gradient: string;
  /** Strong accent for highlights, rules and badges. */
  accent: string;
  /** Soft accent used for large decorative shapes. */
  accentSoft: string;
  /** Two light sources that drift across the background. */
  glowA: string;
  glowB: string;
  /** Pattern ink (dots / grid / waves). */
  pattern: string;
}

export const PALETTES: Record<PaletteId, PaletteStyle> = {
  // Educational light-blue family.
  sky: {
    gradient: 'linear-gradient(155deg, #0B3C6B 0%, #1774B8 46%, #4AAEE6 100%)',
    accent: '#FFE066',
    accentSoft: 'rgba(255,255,255,0.16)',
    glowA: 'rgba(180,230,255,0.30)',
    glowB: 'rgba(120,200,255,0.26)',
    pattern: 'rgba(255,255,255,0.13)',
  },
  // Vibrant purple.
  violet: {
    gradient: 'linear-gradient(155deg, #331A63 0%, #5F35B5 46%, #9163E8 100%)',
    accent: '#FFD166',
    accentSoft: 'rgba(255,255,255,0.15)',
    glowA: 'rgba(190,160,255,0.32)',
    glowB: 'rgba(255,190,240,0.24)',
    pattern: 'rgba(255,255,255,0.12)',
  },
  // Coral / orange.
  coral: {
    gradient: 'linear-gradient(155deg, #7A2414 0%, #CF4B2A 46%, #FF8B5E 100%)',
    accent: '#FFE9A8',
    accentSoft: 'rgba(255,255,255,0.15)',
    glowA: 'rgba(255,210,170,0.32)',
    glowB: 'rgba(255,150,120,0.28)',
    pattern: 'rgba(255,255,255,0.13)',
  },
  // Turquoise / teal.
  teal: {
    gradient: 'linear-gradient(155deg, #07453F 0%, #0D8076 46%, #33BFAE 100%)',
    accent: '#FFE066',
    accentSoft: 'rgba(255,255,255,0.15)',
    glowA: 'rgba(160,240,225,0.30)',
    glowB: 'rgba(120,215,255,0.24)',
    pattern: 'rgba(255,255,255,0.12)',
  },
  // Yellow infographic family: warm amber, dark enough under white text.
  sunshine: {
    gradient: 'linear-gradient(155deg, #7A4A00 0%, #C98A12 46%, #E8B84A 100%)',
    accent: '#FFF6C2',
    accentSoft: 'rgba(255,255,255,0.18)',
    glowA: 'rgba(255,235,180,0.34)',
    glowB: 'rgba(255,200,120,0.26)',
    pattern: 'rgba(80,50,0,0.16)',
  },
  // Pink, for sound / music / biology topics.
  rose: {
    gradient: 'linear-gradient(155deg, #5E0F36 0%, #B22670 46%, #EE6AA6 100%)',
    accent: '#FFE066',
    accentSoft: 'rgba(255,255,255,0.16)',
    glowA: 'rgba(255,190,225,0.32)',
    glowB: 'rgba(210,170,255,0.24)',
    pattern: 'rgba(255,255,255,0.13)',
  },
  // Fresh green, for nature / biology topics.
  mint: {
    gradient: 'linear-gradient(155deg, #0C3D24 0%, #177A4B 46%, #45C583 100%)',
    accent: '#FFE066',
    accentSoft: 'rgba(255,255,255,0.15)',
    glowA: 'rgba(180,255,215,0.30)',
    glowB: 'rgba(150,235,255,0.22)',
    pattern: 'rgba(255,255,255,0.12)',
  },
  // Deep blue-violet, for space / tech topics.
  indigo: {
    gradient: 'linear-gradient(155deg, #101550 0%, #2432A8 46%, #5B6EE8 100%)',
    accent: '#FFD166',
    accentSoft: 'rgba(255,255,255,0.15)',
    glowA: 'rgba(170,190,255,0.32)',
    glowB: 'rgba(200,160,255,0.24)',
    pattern: 'rgba(255,255,255,0.12)',
  },
};

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === 'string' && (PALETTE_IDS as readonly string[]).includes(value);
}

export function paletteStyle(id: PaletteId): PaletteStyle {
  return PALETTES[id];
}
