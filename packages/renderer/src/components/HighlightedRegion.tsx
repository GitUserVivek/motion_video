import React from 'react';
import { useCurrentFrame } from 'remotion';
import { interpolate } from 'remotion';

export interface HighlightedRegionProps {
  children: React.ReactNode;
  highlightColor?: string;
  pulse?: boolean;
  startFrame?: number;
  duration?: number;
  shape?: 'circle' | 'rectangle' | 'rounded';
}

export function HighlightedRegion({
  children,
  highlightColor = '#FFD700',
  pulse = true,
  startFrame = 0,
  duration = 60,
  shape = 'rounded',
}: HighlightedRegionProps): React.ReactElement {
  const frame = useCurrentFrame();

  const progress = Math.min(1, Math.max(0, (frame - startFrame) / duration));

  // Pulse animation
  const pulseScale = pulse
    ? interpolate(frame, [startFrame, startFrame + 30, startFrame + 60], [1, 1.1, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 1;

  const opacity = interpolate(frame, [startFrame, startFrame + 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const shapeStyle: React.CSSProperties = {
    circle: {
      borderRadius: '50%',
    },
    rectangle: {
      borderRadius: 0,
    },
    rounded: {
      borderRadius: 20,
    },
  }[shape] || {};

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {children}

      {/* Highlight overlay */}
      <div
        style={{
          position: 'absolute',
          inset: -10,
          background: highlightColor,
          opacity: opacity * 0.3,
          transform: `scale(${pulseScale})`,
          transformOrigin: 'center',
          pointerEvents: 'none',
          zIndex: 1,
          ...shapeStyle,
          transition: 'transform 0.1s ease',
        }}
      />

      {/* Border pulse */}
      <div
        style={{
          position: 'absolute',
          inset: -15,
          border: `3px solid ${highlightColor}`,
          opacity: opacity * 0.8,
          transform: `scale(${pulseScale})`,
          transformOrigin: 'center',
          pointerEvents: 'none',
          zIndex: 2,
          ...shapeStyle,
          transition: 'transform 0.1s ease',
        }}
      />

      {/* Glow effect */}
      <div
        style={{
          position: 'absolute',
          inset: -25,
          background: `radial-gradient(circle, ${highlightColor} 0%, transparent 70%)`,
          opacity: opacity * 0.5,
          transform: `scale(${pulseScale})`,
          transformOrigin: 'center',
          pointerEvents: 'none',
          zIndex: 0,
          ...shapeStyle,
          transition: 'transform 0.1s ease',
        }}
      />
    </div>
  );
}
