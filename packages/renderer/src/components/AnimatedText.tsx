import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { fadeIn, slideIn, bounce, zoomIn } from '../utils/animation.js';
import type { SlideDirection } from '../utils/animation.js';

export type TextAnimation =
  | 'fadeIn'
  | 'slideUp'
  | 'slideDown'
  | 'slideLeft'
  | 'slideRight'
  | 'bounce'
  | 'zoom'
  | 'words'
  | 'none';

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

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    top: top ?? '10%',
    left: left ?? '50%',
    right,
    bottom,
    width,
    padding,
    fontSize,
    fontWeight,
    color,
    textAlign,
    fontFamily,
    textShadow,
    lineHeight,
    willChange: 'opacity, transform',
  };

  // Kinetic typography: each word rises into place on its own beat.
  if (animation === 'words') {
    const words = text.split(/\s+/).filter(Boolean);
    return (
      <div
        style={{
          ...containerStyle,
          left: left ?? '50%',
          transform: 'translateX(-50%)',
          opacity: 1,
        }}
      >
        {words.map((word, i) => {
          const wordStart = startFrame + i * 3;
          const wordOpacity = fadeIn(frame, wordStart, 10);
          const y = interpolate(frame, [wordStart, wordStart + 14], [22, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          return (
            <span
              key={`${word}-${i}`}
              style={{
                display: 'inline-block',
                opacity: wordOpacity,
                transform: `translateY(${y}px)`,
                marginRight: '0.3em',
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div
      style={{
        ...containerStyle,
        transform: left === '50%' && transform === 'none'
          ? 'translateX(-50%)'
          : left === '50%'
          ? `translateX(-50%) ${transform}`
          : transform,
        opacity,
      }}
    >
      {text}
    </div>
  );
}
