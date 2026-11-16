import React from 'react';
import { AbsoluteFill } from 'remotion';

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

export function BackgroundScene({
  color,
  gradient,
  theme = 'educational',
  pattern = 'none',
}: BackgroundSceneProps): React.ReactElement {
  const bg = color
    ? color
    : gradient ?? THEME_GRADIENTS[theme] ?? THEME_GRADIENTS['educational'];

  const patternStyle = pattern === 'dots'
    ? {
        backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)`,
        backgroundSize: '30px 30px',
      }
    : pattern === 'grid'
    ? {
        backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
                          linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
        backgroundSize: '50px 50px',
      }
    : {};

  return (
    <AbsoluteFill style={{ background: bg, ...patternStyle }} />
  );
}
