import React from 'react';
import { useCurrentFrame } from 'remotion';
import { interpolate } from 'remotion';

export interface ProgressBarProps {
  totalFrames?: number;
  color?: string;
  backgroundColor?: string;
  height?: number;
  top?: string;
  label?: string;
  showPercentage?: boolean;
}

export function ProgressBar({
  totalFrames = 1200,
  color = '#4A90D9',
  backgroundColor = 'rgba(255,255,255,0.2)',
  height = 8,
  top = '5%',
  label,
  showPercentage = false,
}: ProgressBarProps): React.ReactElement {
  const frame = useCurrentFrame();
  const percent = interpolate(frame, [0, totalFrames], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: '5%',
        right: '5%',
      }}
    >
      {label && (
        <div
          style={{
            fontSize: 28,
            color: 'rgba(255,255,255,0.7)',
            fontFamily: '\'Segoe UI\', system-ui, sans-serif',
            marginBottom: 6,
            fontWeight: 600,
          }}
        >
          {label} {showPercentage && `${Math.round(percent)}%`}
        </div>
      )}
      <div
        style={{
          width: '100%',
          height,
          backgroundColor,
          borderRadius: height,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: '100%',
            backgroundColor: color,
            borderRadius: height,
            transition: 'width 0.1s linear',
            boxShadow: `0 0 10px ${color}80`,
          }}
        />
      </div>
    </div>
  );
}
