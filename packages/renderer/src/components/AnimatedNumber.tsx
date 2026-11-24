import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { countUp, fadeIn } from '../utils/animation.js';
import { FONTS, INK, springIn } from '../utils/design.js';

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
  textShadow?: string;
}

export function AnimatedNumber({
  target,
  startFrame = 0,
  duration = 60,
  prefix = '',
  suffix = '',
  fontSize = 260,
  color = '#FFB703',
  fontWeight = 900,
  top = '40%',
  left = '50%',
  textShadow = '10px 10px 0 #111111',
}: AnimatedNumberProps): React.ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const value = countUp(frame, startFrame, duration, target);
  const opacity = fadeIn(frame, startFrame, 15);
  const appear = springIn(frame, fps, startFrame, { damping: 14, stiffness: 110 });
  const scale = interpolate(appear, [0, 1], [0.72, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        transform: `translate(-50%, -50%) scale(${scale}) rotate(-2deg)`,
        fontSize,
        fontWeight,
        color,
        opacity: Math.min(1, Math.max(0, opacity)),
        fontFamily: FONTS.display,
        letterSpacing: -10,
        lineHeight: 0.78,
        textShadow,
        textAlign: 'center',
        userSelect: 'none',
        zIndex: 10,
        WebkitTextStroke: color === INK ? 'none' : `2px ${INK}`,
      }}
    >
      {prefix}{value}{suffix}
    </div>
  );
}
