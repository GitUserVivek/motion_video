import React from 'react';
import { useCurrentFrame } from 'remotion';
import { wave, point, fadeIn } from '../utils/animation.js';

export type CharacterState = 'idle' | 'wave' | 'point' | 'thinking';

export interface CharacterProps {
  state?: CharacterState;
  color?: string;
  accentColor?: string;
  size?: number;
  top?: string;
  left?: string;
  startFrame?: number;
  flipX?: boolean;
}

export function Character({
  state = 'idle',
  color = '#4A90D9',
  accentColor = '#FFD700',
  size = 200,
  top = '50%',
  left = '50%',
  startFrame = 0,
  flipX = false,
}: CharacterProps): React.ReactElement {
  const frame = useCurrentFrame();
  const opacity = fadeIn(frame, startFrame, 20);

  // Idle body bob
  const bodyBob = Math.sin((frame - startFrame) * 0.1) * 4;

  // Arm rotation based on state
  let armRotation = 0;
  if (state === 'wave') armRotation = wave(frame, startFrame);
  else if (state === 'point') armRotation = point(frame, startFrame, 30);
  else if (state === 'thinking') armRotation = -40;

  const scale = size / 200;

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        transform: `translate(-50%, -50%) scaleX(${flipX ? -1 : 1})`,
        opacity,
        willChange: 'opacity',
      }}
    >
      <svg
        width={size}
        height={size * 1.4}
        viewBox="0 0 200 280"
        xmlns="http://www.w3.org/2000/svg"
        style={{ transform: `translateY(${bodyBob}px)`, display: 'block' }}
      >
        {/* Head */}
        <circle cx="100" cy="55" r="45" fill={color} />
        {/* Eyes */}
        <circle cx="85" cy="50" r="7" fill="white" />
        <circle cx="115" cy="50" r="7" fill="white" />
        <circle cx="87" cy="52" r="4" fill="#1a1a2e" />
        <circle cx="117" cy="52" r="4" fill="#1a1a2e" />
        {/* Smile */}
        <path d="M85 70 Q100 82 115 70" stroke="#1a1a2e" strokeWidth="3" fill="none" strokeLinecap="round" />
        {/* Body */}
        <rect x="70" y="100" width="60" height="80" rx="10" fill={color} transform={`translateY(${bodyBob * 0.5})`} />
        {/* Left arm */}
        <g transform={`translate(70, 110) rotate(${state === 'wave' ? 0 : armRotation} 0 0)`}>
          <rect x="-30" y="-8" width="32" height="16" rx="8" fill={color} />
          <circle cx="-30" cy="0" r="10" fill={accentColor} />
        </g>
        {/* Right arm (wave/point arm) */}
        <g transform={`translate(130, 110) rotate(${armRotation} 0 0)`}>
          <rect x="0" y="-8" width="32" height="16" rx="8" fill={color} />
          <circle cx="32" cy="0" r="10" fill={accentColor} />
        </g>
        {/* Legs */}
        <rect x="78" y="178" width="18" height="50" rx="9" fill={color} />
        <rect x="104" y="178" width="18" height="50" rx="9" fill={color} />
        {/* Feet */}
        <ellipse cx="87" cy="228" rx="16" ry="8" fill={accentColor} />
        <ellipse cx="113" cy="228" rx="16" ry="8" fill={accentColor} />
      </svg>
    </div>
  );
}
