import React from 'react';
import { useCurrentFrame, AbsoluteFill } from 'remotion';
import { interpolate } from 'remotion';

export interface ObjectZoomProps {
  children: React.ReactNode;
  startFrame: number;
  duration: number;
  zoomFactor?: number;
  startScale?: number;
  endScale?: number;
}

export function ObjectZoom({
  children,
  startFrame,
  duration,
  zoomFactor = 1.5,
  startScale = 1,
  endScale = 1.5,
}: ObjectZoomProps): React.ReactElement {
  const frame = useCurrentFrame();

  // Calculate progress through the zoom animation
  const progress = Math.min(1, Math.max(0, (frame - startFrame) / duration));

  // Easing function for smooth zoom
  const easeInOutCubic = (t: number): number =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  const easedProgress = easeInOutCubic(progress);

  // Calculate current scale
  const scale = startScale + (endScale - startScale) * easedProgress;

  // Calculate position adjustment to keep object centered during zoom
  const translateX = (1 - scale) * 50;
  const translateY = (1 - scale) * 50;

  // Opacity animation
  const opacity = interpolate(frame, [startFrame, startFrame + duration * 0.3], [1, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Glow effect
  const glowIntensity = interpolate(frame, [startFrame, startFrame + duration * 0.5], [0, 0.5], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at center, rgba(255, 255, 255, ${glowIntensity}) 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />

      {/* Zooming container */}
      <div
        style={{
          transform: `translate(${translateX}%, ${translateY}%) scale(${scale})`,
          transformOrigin: 'center',
          willChange: 'transform',
          transition: 'transform 0.1s ease',
        }}
      >
        {children}
      </div>

      {/* Vignette effect */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at center, transparent 0%, rgba(0, 0, 0, ${0.3 * progress}) 100%)`,
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
}
