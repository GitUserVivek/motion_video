import { PALETTE_IDS, pickScenePalette, type PaletteId } from '@edumotion/shared';

/**
 * Paper-and-ink colour direction for the renderer.
 *
 * Every scene is a sheet of lightly tinted paper with a faint grid, black
 * display type and a small family of saturated stickers. The dark values are
 * only used when a scene deliberately asks for a "night" beat; cards, panels
 * and captions stay light so black type is always readable.
 */

export { PALETTE_IDS, pickScenePalette };
export type { PaletteId };

export interface PaletteStyle {
  /** Light paper used for the scene background. */
  bg: string;
  /** Faint grid ink printed on the paper. */
  grid: string;
  /** Strong sticker / accent colour. */
  accent: string;
  /** Softer version of the accent for large decorative shapes. */
  accentSoft: string;
  /** Deliberate dark beat, used sparingly. */
  darkBg: string;
  /** Grid ink for the dark beat. */
  darkGrid: string;
}

export const PALETTES: Record<PaletteId, PaletteStyle> = {
  sky: {
    bg: '#E8F1FF',
    grid: 'rgba(26,64,128,0.13)',
    accent: '#2F6BFF',
    accentSoft: '#BFD4FF',
    darkBg: '#101A3A',
    darkGrid: 'rgba(255,255,255,0.09)',
  },
  violet: {
    bg: '#EEE9FF',
    grid: 'rgba(61,35,130,0.13)',
    accent: '#7A5CFF',
    accentSoft: '#D4C8FF',
    darkBg: '#221646',
    darkGrid: 'rgba(255,255,255,0.09)',
  },
  coral: {
    bg: '#FFE7DC',
    grid: 'rgba(122,36,20,0.13)',
    accent: '#FF5A1F',
    accentSoft: '#FFC2A8',
    darkBg: '#3A1710',
    darkGrid: 'rgba(255,255,255,0.09)',
  },
  teal: {
    bg: '#DFF7EF',
    grid: 'rgba(7,69,63,0.13)',
    accent: '#0FB58A',
    accentSoft: '#A8EBD8',
    darkBg: '#073B32',
    darkGrid: 'rgba(255,255,255,0.09)',
  },
  sunshine: {
    bg: '#FFF2C7',
    grid: 'rgba(95,68,0,0.14)',
    accent: '#FFB703',
    accentSoft: '#FFE08A',
    darkBg: '#3D2C00',
    darkGrid: 'rgba(255,255,255,0.09)',
  },
  rose: {
    bg: '#FFE4EE',
    grid: 'rgba(94,15,54,0.13)',
    accent: '#FF4F8B',
    accentSoft: '#FFB8D2',
    darkBg: '#3D0F24',
    darkGrid: 'rgba(255,255,255,0.09)',
  },
  mint: {
    bg: '#E1F8E8',
    grid: 'rgba(12,61,36,0.13)',
    accent: '#1DB56B',
    accentSoft: '#A9EEC5',
    darkBg: '#073B23',
    darkGrid: 'rgba(255,255,255,0.09)',
  },
  indigo: {
    bg: '#E6E9FF',
    grid: 'rgba(17,22,61,0.14)',
    accent: '#3347FF',
    accentSoft: '#B8C1FF',
    darkBg: '#11163D',
    darkGrid: 'rgba(255,255,255,0.09)',
  },
};

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === 'string' && (PALETTE_IDS as readonly string[]).includes(value);
}

export function paletteStyle(id: PaletteId): PaletteStyle {
  return PALETTES[id];
}
