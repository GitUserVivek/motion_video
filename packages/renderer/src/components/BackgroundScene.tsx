import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

export interface BackgroundSceneProps {
  color?: string;
  gradient?: string;
  theme?: 'educational' | 'modern' | 'playful' | 'minimal';
  pattern?: 'none' | 'dots' | 'grid' | 'waves';
}

const THEME_GRADIENTS: Record<string, string> = {
  educational: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
  modern:      'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
  playful:     'linear-gradient(135deg, #f093fb 0%, #f5576c 50%, #4facfe 100%)',
  minimal:     'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
};

/**
 * Animated background: the base gradient is static, but two soft light sources
 * drift across it and the optional pattern scrolls, so no shot is ever frozen.
 */
export function BackgroundScene({
  color,
  gradient,
  theme = 'educational',
  pattern = 'none',
}: BackgroundSceneProps): React.ReactElement {
  const frame = useCurrentFrame();
  const bg = color
    ? color
    : gradient ?? THEME_GRADIENTS[theme] ?? THEME_GRADIENTS['educational'];

  const drift = interpolate(frame, [0, 900], [0, 9]);
  const driftBack = interpolate(frame, [0, 900], [0, -7]);
  const scroll = frame * 0.5;

  const patternStyle: React.CSSProperties = pattern === 'dots'
    ? {
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)',
        backgroundSize: '30px 30px',
      }
    : pattern === 'grid'
    ? {
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),' +
          'linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
        backgroundSize: '50px 50px',
      }
    : {};

  return (
    <AbsoluteFill style={{ background: bg, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${28 + drift}% ${24 + driftBack}%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 55%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${76 - drift}% ${72 + driftBack}%, rgba(120,190,255,0.22) 0%, rgba(120,190,255,0) 58%)`,
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
            'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0) 28%, rgba(0,0,0,0) 68%, rgba(0,0,0,0.5) 100%)',
        }}
      />
    </AbsoluteFill>
  );
}
