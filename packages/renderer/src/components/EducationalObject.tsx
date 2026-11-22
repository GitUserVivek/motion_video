import React from 'react';
import { useCurrentFrame, Img } from 'remotion';
import { ICON_PATHS, type ObjectType } from '../utils/icons.js';
import { fadeIn, bounce } from '../utils/animation.js';

export type { ObjectType } from '../utils/icons.js';export interface EducationalObjectProps {
  type?: ObjectType;
  /** Optional artwork (data URL from resources/), drawn instead of the glyph. */
  image?: string;
  size?: number;
  color?: string;
  top?: string;
  left?: string;
  startFrame?: number;
  animation?: 'fadeIn' | 'bounce' | 'none';
}export function EducationalObject({
  type = 'book',
  image,
  size = 100,
  color: _color,
  top = '50%',
  left = '50%',
  startFrame = 0,
  animation = 'bounce',
}: EducationalObjectProps): React.ReactElement {
  const frame = useCurrentFrame();
  const opacity = fadeIn(frame, startFrame, 20);
  const scale = animation === 'bounce'
    ? bounce(frame, startFrame, 30)
    : animation === 'fadeIn'
    ? fadeIn(frame, startFrame, 20)
    : 1;

  const elapsed = frame - startFrame;
  // Continuous idle motion keeps every icon alive for its whole scene.
  const floatY = elapsed > 0 ? Math.sin(elapsed * 0.06) * size * 0.035 : 0;
  const tilt = elapsed > 0 ? Math.sin(elapsed * 0.045) * 3 : 0;
  const glow = 0.4 + Math.sin(elapsed * 0.05) * 0.15;

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        transform: `translate(-50%, -50%) translateY(${floatY}px) rotate(${tilt}deg) scale(${scale})`,
        opacity,
        willChange: 'opacity, transform',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: size * 0.95,
          height: size * 0.95,
          transform: 'translate(-50%, -50%)',
          // Gradient already gives the soft edge; blurring it again repainted
          // the glow every frame for no visible difference.
          background: 'radial-gradient(circle, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 62%)',
          opacity: glow,
          pointerEvents: 'none',
        }}
      />      {image ? (
        <Img
          src={image}
          style={{
            width: size * 0.78,
            height: size * 0.78,
            objectFit: 'contain',
          }}
        />
      ) : (
        <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          {ICON_PATHS[type] ?? ICON_PATHS.book}
        </svg>
      )}
    </div>
  );
}
