import { spring } from 'remotion';

/**
 * The visual system shared by every renderer component.
 *
 * The reference direction is editorial motion graphics: cream paper, black
 * display type, saturated sticker colours, a hard offset shadow and a thin
 * timeline at the bottom of the frame. Keeping the tokens here means a new
 * component cannot quietly drift back to gradients and glow.
 */

export const INK = '#111111';
export const PAPER = '#FFFDF6';
export const PAPER_ALT = '#F4EEDC';
export const WHITE = '#FFFFFF';
export const MUTED = '#5B564C';

export const FONTS = {
  display: '"Ubuntu Sans", "DejaVu Sans", "Liberation Sans", sans-serif',
  body: '"Ubuntu Sans", "DejaVu Sans", "Liberation Sans", sans-serif',
  mono: '"DejaVu Sans Mono", "Ubuntu Mono", monospace',
} as const;

/** Sticker colours, in the order they are handed to cards and chips. */
export const ACCENT_CYCLE = [
  '#2F6BFF',
  '#FFB703',
  '#FF5A1F',
  '#1DB56B',
  '#FF4F8B',
  '#7A5CFF',
] as const;

export function accentAt(index: number): string {
  const value = ACCENT_CYCLE[index % ACCENT_CYCLE.length];
  return value ?? ACCENT_CYCLE[0];
}

export const BORDER = `4px solid ${INK}`;
export const BORDER_THIN = `3px solid ${INK}`;
export const CARD_SHADOW = '10px 10px 0 #111111';
export const CARD_SHADOW_SM = '6px 6px 0 #111111';
export const STICKER_SHADOW = '8px 8px 0 #111111';
export const CARD_RADIUS = 20;

/** A deterministic spring used for entrances. */
export function springIn(
  frame: number,
  fps: number,
  delay = 0,
  config: { damping?: number; stiffness?: number; mass?: number } = {},
): number {
  return spring({
    frame: frame - delay,
    fps,
    config: {
      damping: config.damping ?? 18,
      stiffness: config.stiffness ?? 120,
      mass: config.mass ?? 0.7,
    },
  });
}

/** True for a plain six-digit hex colour, safe to concatenate alpha onto. */
export function isHex(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}
