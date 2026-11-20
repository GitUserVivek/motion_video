import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { interpolate } from 'remotion';

export interface NumberCounterProps {
  target: number;
  startFrame: number;
  duration?: number;
  fontSize?: number;
  color?: string;
  suffix?: string;
  prefix?: string;
  decimalPlaces?: number;
}

export function NumberCounter({
  target,
  startFrame,
  duration = 60,
  fontSize = 72,
  color = '#FFD700',
  suffix = '',
  prefix = '',
  decimalPlaces = 0,
}: NumberCounterProps): React.ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Calculate progress (0 to 1)
  const progress = Math.min(1, Math.max(0, (frame - startFrame) / duration));

  // Easing function for smooth counting
  const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
  const easedProgress = easeOutCubic(progress);

  // Calculate current value
  const startValue = 0;
  const currentValue = startValue + (target - startValue) * easedProgress;

  // Format number
  const formattedNumber = decimalPlaces > 0
    ? currentValue.toFixed(decimalPlaces)
    : Math.round(currentValue).toLocaleString();

  // Add comma separators for thousands
  const displayValue = formattedNumber.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // Animation effects
  const scale = interpolate(frame, [startFrame, startFrame + 15], [0.8, 1.1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const opacity = interpolate(frame, [startFrame, startFrame + 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Bounce effect at the end
  const bounce = progress > 0.8
    ? Math.sin((progress - 0.8) * 20) * 0.05 + 1
    : 1;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        transform: `scale(${scale * bounce})`,
        opacity,
        willChange: 'transform, opacity',
      }}
    >
      {prefix && (
        <span
          style={{
            fontSize: fontSize * 0.7,
            color,
            marginRight: 8,
          }}
        >
          {prefix}
        </span>
      )}

      <span
        style={{
          fontSize,
          fontWeight: 'bold',
          color,
          textShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {displayValue}
      </span>

      {suffix && (
        <span
          style={{
            fontSize: fontSize * 0.7,
            color,
            marginLeft: 8,
          }}
        >
          {suffix}
        </span>
      )}
    </div>
  );
}
