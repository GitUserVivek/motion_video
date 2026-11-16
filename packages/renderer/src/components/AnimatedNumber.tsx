import React from 'react';
import { useCurrentFrame } from 'remotion';
import { countUp, fadeIn } from '../utils/animation.js';

export interface AnimatedNumberProps {
  target: number;
  startFrame?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  fontSize?: number;
  color?: string;
  fontWeight?: number;
  top?: string;
  left?: string;
}

export function AnimatedNumber({
  target,
  startFrame = 0,
  duration = 60,
  prefix = '',
  suffix = '',
  fontSize = 120,
  color = '#FFD700',
  fontWeight = 900,
  top = '40%',
  left = '50%',
}: AnimatedNumberProps): React.ReactElement {
  const frame = useCurrentFrame();
  const value = countUp(frame, startFrame, duration, target);
  const opacity = fadeIn(frame, startFrame, 15);

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        transform: 'translate(-50%, -50%)',
        fontSize,
        fontWeight,
        color,
        opacity,
        fontFamily: '\'Segoe UI\', system-ui, monospace',
        textShadow: `0 0 30px ${color}80`,
        userSelect: 'none',
      }}
    >
      {prefix}{value}{suffix}
    </div>
  );
}
