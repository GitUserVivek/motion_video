import React from 'react';
import { AbsoluteFill } from 'remotion';
import { isPaletteId, PALETTES, type PaletteId } from '../utils/palette.js';
import { ShapeCluster } from './motion/Primitives.js';

export interface BackgroundSceneProps {
  color?: string;
  /** Kept for older storyboards; the paper system ignores gradients. */
  gradient?: string;
  /** Colour family chosen by the backend scene director. */
  palette?: string;
  theme?: 'educational' | 'modern' | 'playful' | 'minimal';
  pattern?: 'none' | 'dots' | 'grid' | 'waves';
  /** The one deliberate dark beat, used for a hook or a closing card. */
  tone?: 'light' | 'dark';
  seed?: number;
}

/** Older storyboards only carry `theme`; map it onto the new colour families. */
const THEME_PALETTES: Record<string, PaletteId> = {
  educational: 'sky',
  modern: 'violet',
  playful: 'rose',
  minimal: 'indigo',
};

/**
 * A sheet of tinted paper, a faint printed grid and three oversized shapes.
 * No gradients, no glows, no vignette: the headline has to carry the frame.
 */
export function BackgroundScene({
  color,
  palette,
  theme = 'educational',
  pattern = 'grid',
  tone = 'light',
  seed = 0,
}: BackgroundSceneProps): React.ReactElement {
  const paletteId: PaletteId = isPaletteId(palette)
    ? palette
    : THEME_PALETTES[theme] ?? 'sky';
  const style = PALETTES[paletteId];
  const dark = tone === 'dark';
  const bg = color ?? (dark ? style.darkBg : style.bg);
  const gridInk = dark ? style.darkGrid : style.grid;

  const gridSize = pattern === 'dots' ? 30 : pattern === 'grid' ? 54 : 64;
  const patternStyle: React.CSSProperties =
    pattern === 'dots'
      ? {
          backgroundImage: `radial-gradient(circle, ${gridInk} 1.7px, transparent 1.7px)`,
          backgroundSize: `${gridSize}px ${gridSize}px`,
        }
      : pattern === 'waves'
        ? {
            backgroundImage: `repeating-linear-gradient(135deg, ${gridInk} 0 1px, transparent 1px 42px)`,
          }
        : {
            backgroundImage:
              `linear-gradient(to right, ${gridInk} 1px, transparent 1px),` +
              `linear-gradient(to bottom, ${gridInk} 1px, transparent 1px)`,
            backgroundSize: `${gridSize}px ${gridSize}px`,
          };

  return (
    <AbsoluteFill style={{ background: bg, overflow: 'hidden' }}>
      <AbsoluteFill style={patternStyle} />
      <ShapeCluster palette={paletteId} dark={dark} seed={seed} />
    </AbsoluteFill>
  );
}
