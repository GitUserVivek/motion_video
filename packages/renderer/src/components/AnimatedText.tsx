import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { fitFontSize } from '@edumotion/shared';
import {
  accentAt,
  BORDER,
  FONTS,
  INK,
  springIn,
  STICKER_SHADOW,
} from '../utils/design.js';

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

export type TextVariant = 'display' | 'label' | 'body';

export interface AnimatedTextProps {
  text: string;
  variant?: TextVariant;
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
  /** Sticker fill for the `label` variant. */
  accent?: string;
  rotate?: number;
  /** Turn off the automatic uppercase treatment for body copy. */
  uppercase?: boolean;
}

export function AnimatedText({
  text,
  variant = 'display',
  animation = 'words',
  startFrame = 0,
  fontSize = 78,
  color = INK,
  fontWeight = 900,
  textAlign = 'center',
  fontFamily,
  top,
  left,
  right,
  bottom,
  width = '88%',
  padding,
  textShadow = 'none',
  lineHeight = 0.94,
  accent = accentAt(1),
  rotate = 0,
  uppercase = true,
}: AnimatedTextProps): React.ReactElement {
  const frame = useCurrentFrame();
  const { fps, width: videoWidth } = useVideoConfig();

  const isLabel = variant === 'label';
  const isBody = variant === 'body';
  const displayFont = fontFamily ?? (isBody ? FONTS.body : FONTS.display);
  const baseSize = isLabel ? Math.max(18, fontSize * 0.34) : Math.max(56, fontSize);
  const availableWidth = Math.max(320, videoWidth * 0.9 - 80);
  const fittedFontSize = isLabel
    ? baseSize
    : fitFontSize(text, availableWidth, isBody ? 54 : 156, baseSize, isBody ? 30 : 46);

  const appear = springIn(frame, fps, startFrame, { damping: 17, stiffness: 120 });
  const rise = (1 - appear) * 28;

  if (isLabel) {
    return (
      <div
        style={{
          position: 'absolute',
          top: top ?? '8%',
          left: left ?? '50%',
          right,
          bottom,
          transform: `translateX(${left === '50%' || left === undefined ? -50 : 0}%) translateY(${rise}px) rotate(${rotate}deg)`,
          opacity: appear,
          zIndex: 30,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: accent,
            border: BORDER,
            borderRadius: 10,
            boxShadow: STICKER_SHADOW,
            color: INK,
            fontFamily: FONTS.display,
            fontSize: fittedFontSize,
            fontWeight: 900,
            letterSpacing: 1.1,
            lineHeight: 1,
            padding: padding ?? '10px 22px',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          {text}
        </div>
      </div>
    );
  }

  const words = text.split(/\s+/).filter(Boolean);
  const useWords = animation === 'words' || (variant === 'display' && animation !== 'none');
  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    top: top ?? '12%',
    left: left ?? '50%',
    right,
    bottom,
    width,
    padding: padding ?? '0 34px',
    color,
    fontFamily: displayFont,
    fontSize: fittedFontSize,
    fontWeight,
    letterSpacing: isBody ? -0.2 : -2.4,
    lineHeight,
    textAlign,
    textShadow,
    textTransform: uppercase && !isBody ? 'uppercase' : 'none',
    transform: `translateX(${left === '50%' || left === undefined ? -50 : 0}%) translateY(${rise}px)`,
    opacity: appear,
    zIndex: 20,
    willChange: 'opacity, transform',
  };

  if (useWords) {
    return (
      <div style={{ ...containerStyle, opacity: 1 }}>
        {words.map((word, index) => {
          const wordStart = startFrame + 2 + index * 2.2;
          const wordAppear = springIn(frame, fps, wordStart, {
            damping: 16,
            stiffness: 160,
            mass: 0.55,
          });
          return (
            <span
              key={`${word}-${index}`}
              style={{
                display: 'inline-block',
                marginRight: '0.23em',
                opacity: Math.min(1, Math.max(0, wordAppear)),
                transform: `translateY(${(1 - wordAppear) * 34}px) rotate(${(1 - wordAppear) * (index % 2 === 0 ? -2 : 2)}deg)`,
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
    );
  }

  return <div style={containerStyle}>{text}</div>;
}
