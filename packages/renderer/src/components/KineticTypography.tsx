import React from 'react';
import { useCurrentFrame } from 'remotion';
import { interpolate } from 'remotion';

export interface WordAnimation {
  word: string;
  startFrame: number;
  animation?: 'fadeIn' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight' | 'bounce' | 'zoom';
  color?: string;
  fontSize?: number;
  fontWeight?: number;
}

export interface KineticTypographyProps {
  text: string;
  words: WordAnimation[];
  top?: string;
  left?: string;
  startFrame?: number;
  lineHeight?: number;
  align?: 'left' | 'center' | 'right';
}

export function KineticTypography({
  text,
  words: customWords,
  top = '50%',
  left = '50%',
  startFrame = 0,
  lineHeight = 1.4,
  align = 'center',
}: KineticTypographyProps): React.ReactElement {
  const frame = useCurrentFrame();

  // If custom words provided, use them
  const wordAnimations = customWords.length > 0
    ? customWords
    : text.split(' ').map((word, index) => ({
        word,
        startFrame: startFrame + index * 5,
        animation: ['fadeIn', 'slideUp', 'bounce', 'zoom'][index % 4] as const,
      }));

  const alignStyle = {
    left: align === 'left' ? '0%' : align === 'right' ? '100%' : '50%',
    transform: align === 'center' ? 'translateX(-50%)' : align === 'right' ? 'translateX(-100%)' : 'none',
  };

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: alignStyle.left,
        transform: alignStyle.transform,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: align,
        lineHeight: String(lineHeight),
      }}
    >
      {wordAnimations.map((anim, index) => {
        const word = anim.word;
        if (!word) return null;

        const animStart = anim.startFrame;
        const duration = 20;
        const progress = Math.min(1, Math.max(0, (frame - animStart) / duration));

        let transform = 'translateY(0)';
        let opacity = interpolate(frame, [animStart, animStart + 10], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

        switch (anim.animation) {
          case 'slideUp':
            transform = `translateY(${interpolate(frame, [animStart, animStart + 10], [30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })})`;
            break;
          case 'slideDown':
            transform = `translateY(${interpolate(frame, [animStart, animStart + 10], [-30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })})`;
            break;
          case 'slideLeft':
            transform = `translateX(${interpolate(frame, [animStart, animStart + 10], [30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })})`;
            break;
          case 'slideRight':
            transform = `translateX(${interpolate(frame, [animStart, animStart + 10], [-30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })})`;
            break;
          case 'bounce':
            const bounceProgress = (frame - animStart) * 0.2;
            transform = `translateY(${Math.sin(bounceProgress) * 10 * (1 - progress)})`;
            break;
          case 'zoom':
            transform = `scale(${interpolate(frame, [animStart, animStart + 10], [0.8, 1.1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })})`;
            break;
          default:
            transform = 'translateY(0)';
        }

        // Bounce effect at the end
        const endBounce = progress > 0.8 ? Math.sin((progress - 0.8) * 20) * 0.05 + 1 : 1;

        return (
          <span
            key={`word-${index}`}
            style={{
              display: 'inline-block',
              margin: '0 4px',
              transform: `${transform} scale(${endBounce})`,
              opacity,
              color: anim.color || '#ffffff',
              fontSize: anim.fontSize || 48,
              fontWeight: anim.fontWeight || 700,
              textShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
              willChange: 'transform, opacity',
              whiteSpace: 'pre',
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
}
