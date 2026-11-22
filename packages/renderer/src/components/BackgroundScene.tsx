import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { PALETTES, isPaletteId, type PaletteId } from '../utils/palette.js';

export interface BackgroundSceneProps {
  color?: string;
  gradient?: string;
  /** Colour family chosen by the backend scene director. */
  palette?: string;
  theme?: 'educational' | 'modern' | 'playful' | 'minimal';
  pattern?: 'none' | 'dots' | 'grid' | 'waves';
}

/** Older storyboards only carry `theme`; map it onto the new colour families. */
const THEME_PALETTES: Record<string, PaletteId> = {
  educational: 'sky',
  modern: 'violet',
  playful: 'rose',
  minimal: 'indigo',
};

type Tint = 'glowA' | 'glowB';

/**
 * Decorative light shapes. Each one loops on its own period, so the background
 * is alive in every frame without a single scene looking like a slideshow.
 */
const BLOBS: Array<{
  x: number;
  y: number;
  size: number;
  tint: Tint;
  driftX: number;
  driftY: number;
  period: number;
}> = [
  { x: 16, y: 18, size: 460, tint: 'glowA', driftX: 26, driftY: -18, period: 150 },
  { x: 80, y: 30, size: 340, tint: 'glowB', driftX: -22, driftY: 22, period: 180 },
  { x: 26, y: 74, size: 400, tint: 'glowB', driftX: 20, driftY: 26, period: 210 },
  { x: 86, y: 84, size: 320, tint: 'glowA', driftX: -18, driftY: -24, period: 240 },
];

export function BackgroundScene({
  color,
  gradient,
  palette,
  theme = 'educational',
  pattern = 'none',
}: BackgroundSceneProps): React.ReactElement {
  const frame = useCurrentFrame();

  const paletteId: PaletteId = isPaletteId(palette)
    ? palette
    : THEME_PALETTES[theme] ?? 'sky';
  const style = PALETTES[paletteId];

  const bg = color ?? gradient ?? style.gradient;
  const scroll = frame * 0.5;

  const patternStyle: React.CSSProperties =
    pattern === 'dots'
      ? {
          backgroundImage: `radial-gradient(circle, ${style.pattern} 1px, transparent 1px)`,
          backgroundSize: '30px 30px',
        }
      : pattern === 'grid'
        ? {
            backgroundImage:
              `linear-gradient(${style.pattern} 1px, transparent 1px),` +
              `linear-gradient(90deg, ${style.pattern} 1px, transparent 1px)`,
            backgroundSize: '54px 54px',
          }
        : pattern === 'waves'
          ? {
              backgroundImage: `repeating-radial-gradient(circle at 50% 115%, ${style.pattern} 0 2px, transparent 2px 46px)`,
              backgroundSize: '100% 100%',
            }
          : {};

  return (
    <AbsoluteFill style={{ background: bg, overflow: 'hidden' }}>
      {/* Soft light sources drifting behind everything else. */}
      {BLOBS.map((blob, index) => {
        const phase = (frame / blob.period) * Math.PI * 2 + index;
        const dx = Math.sin(phase) * blob.driftX;
        const dy = Math.cos(phase) * blob.driftY;

        return (
          <div
            key={`blob-${index}`}
            style={{
              position: 'absolute',
              left: `${blob.x}%`,
              top: `${blob.y}%`,
              width: blob.size,
              height: blob.size,
              marginLeft: -blob.size / 2,
              marginTop: -blob.size / 2,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${style[blob.tint]} 0%, rgba(255,255,255,0) 70%)`,
              filter: 'blur(18px)',
              transform: `translate(${dx}%, ${dy}%) scale(${1 + 0.05 * Math.sin(phase)})`,
              willChange: 'transform',
            }}
          />
        );
      })}

      {/* Subtle brightening from the top keeps the composition from feeling flat. */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse at 50% -10%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 60%)',
        }}
      />

      {pattern !== 'none' && (
        <AbsoluteFill
          style={{
            ...patternStyle,
            backgroundPosition: `${scroll}px ${scroll}px`,
            opacity: 0.9,
          }}
        />
      )}

      {/* Vignette: keeps titles and captions legible over any palette. */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.34) 0%, rgba(0,0,0,0) 26%, rgba(0,0,0,0) 66%, rgba(0,0,0,0.5) 100%)',
        }}
      />
    </AbsoluteFill>
  );
}
