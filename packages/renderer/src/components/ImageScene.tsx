import React from 'react';
import { useCurrentFrame, Img } from 'remotion';
import { interpolate } from 'remotion';

export interface ImageSceneProps {
  src: string;
  alt?: string;
  kenBurns?: boolean;
  opacity?: number;
  objectFit?: 'cover' | 'contain' | 'fill';
}

export function ImageScene({
  src,
  alt = '',
  kenBurns = true,
  opacity = 1,
  objectFit = 'cover',
}: ImageSceneProps): React.ReactElement {
  const frame = useCurrentFrame();

  const scale = kenBurns
    ? interpolate(frame, [0, 300], [1, 1.1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 1;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        opacity,
      }}
    >
      <Img
        src={src}
        alt={alt}
        style={{
          width: '100%',
          height: '100%',
          objectFit,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
      />
    </div>
  );
}
