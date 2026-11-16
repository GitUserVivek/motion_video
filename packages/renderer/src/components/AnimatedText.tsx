import React from 'react';
import { useCurrentFrame } from 'remotion';
import { fadeIn, slideIn, bounce, zoomIn } from '../utils/animation.js';
import type { SlideDirection } from '../utils/animation.js';

export type TextAnimation = 'fadeIn' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight' | 'bounce' | 'zoom' | 'none';

export interface AnimatedTextProps {
  text: string;
  animation?: TextAnimation;
  startFrame?: number;
  animationDuration?: number;
  fontSize?: number;
  color?: string;
  fontWeight?: number | string;
  textAlign?: 'left' | 'center' | 'right';
  fontFamily?: string;
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
  width?: string;
  padding?: string;
  textShadow?: string;
  lineHeight?: number;
}

const SLIDE_DIRECTIONS: Partial<Record<TextAnimation, SlideDirection>> = {
  slideLeft: 'left',
  slideRight: 'right',
  slideUp: 'up',
  slideDown: 'down',
};

export function AnimatedText({
  text,
  animation = 'fadeIn',
  startFrame = 0,
  animationDuration = 20,
  fontSize = 60,
  color = '#ffffff',
  fontWeight = 700,
  textAlign = 'center',
  fontFamily = '\'Segoe UI\', system-ui, sans-serif',
  top,
  left,
  right,
  bottom,
  width = '90%',
  padding = '0 40px',
  textShadow = '0 2px 8px rgba(0,0,0,0.5)',
  lineHeight = 1.3,
}: AnimatedTextProps): React.ReactElement {
  const frame = useCurrentFrame();

  let opacity = 1;
  let transform = 'none';

  switch (animation) {
    case 'fadeIn':
      opacity = fadeIn(frame, startFrame, animationDuration);
      break;
    case 'slideUp':
    case 'slideDown':
    case 'slideLeft':
    case 'slideRight': {
      const dir = SLIDE_DIRECTIONS[animation] ?? 'up';
      opacity = fadeIn(frame, startFrame, animationDuration);
      transform = slideIn(frame, dir, startFrame, animationDuration);
      break;
    }
    case 'bounce':
      transform = `scale(${bounce(frame, startFrame, animationDuration)})`;
      opacity = fadeIn(frame, startFrame, 10);
      break;
    case 'zoom':
      transform = `scale(${zoomIn(frame, startFrame, animationDuration)})`;
      opacity = fadeIn(frame, startFrame, animationDuration);
      break;
    case 'none':
    default:
      opacity = 1;
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: top ?? '10%',
        left: left ?? '50%',
        right,
        bottom,
        transform: left === '50%' && transform === 'none'
          ? 'translateX(-50%)'
          : left === '50%'
          ? `translateX(-50%) ${transform}`
          : transform,
        width,
        padding,
        fontSize,
        fontWeight,
        color,
        textAlign,
        fontFamily,
        textShadow,
        lineHeight,
        opacity,
        willChange: 'opacity, transform',
      }}
    >
      {text}
    </div>
  );
}
