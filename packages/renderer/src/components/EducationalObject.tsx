import React from 'react';
import { useCurrentFrame } from 'remotion';
import { fadeIn, bounce } from '../utils/animation.js';

export type ObjectType = 'book' | 'apple' | 'globe' | 'atom' | 'lightbulb' | 'calculator' | 'pencil' | 'star';

export interface EducationalObjectProps {
  type?: ObjectType;
  size?: number;
  color?: string;
  top?: string;
  left?: string;
  startFrame?: number;
  animation?: 'fadeIn' | 'bounce' | 'none';
}

const OBJECT_PATHS: Record<ObjectType, React.ReactElement> = {
  book: (
    <g>
      <rect x="10" y="10" width="80" height="80" rx="5" fill="#4A90D9" />
      <rect x="20" y="20" width="60" height="60" rx="3" fill="#E8F4FD" />
      <line x1="50" y1="20" x2="50" y2="80" stroke="#4A90D9" strokeWidth="4" />
      <rect x="25" y="30" width="20" height="3" rx="1" fill="#4A90D9" />
      <rect x="25" y="38" width="18" height="3" rx="1" fill="#4A90D9" />
      <rect x="25" y="46" width="20" height="3" rx="1" fill="#4A90D9" />
    </g>
  ),
  apple: (
    <g>
      <circle cx="50" cy="55" r="35" fill="#E74C3C" />
      <ellipse cx="35" cy="45" rx="12" ry="8" fill="rgba(255,255,255,0.3)" />
      <rect x="47" y="15" width="6" height="18" rx="3" fill="#27AE60" />
      <path d="M53 20 Q70 10 72 25" stroke="#27AE60" strokeWidth="3" fill="none" />
    </g>
  ),
  globe: (
    <g>
      <circle cx="50" cy="50" r="40" fill="#3498DB" stroke="#2980B9" strokeWidth="2" />
      <ellipse cx="50" cy="50" rx="20" ry="40" fill="none" stroke="#ECF0F1" strokeWidth="2" />
      <line x1="10" y1="50" x2="90" y2="50" stroke="#ECF0F1" strokeWidth="2" />
      <line x1="50" y1="10" x2="50" y2="90" stroke="#ECF0F1" strokeWidth="1" />
    </g>
  ),
  atom: (
    <g>
      <circle cx="50" cy="50" r="10" fill="#FFD700" />
      <ellipse cx="50" cy="50" rx="40" ry="15" fill="none" stroke="#4A90D9" strokeWidth="3" />
      <ellipse cx="50" cy="50" rx="40" ry="15" fill="none" stroke="#E74C3C" strokeWidth="3" transform="rotate(60 50 50)" />
      <ellipse cx="50" cy="50" rx="40" ry="15" fill="none" stroke="#2ECC71" strokeWidth="3" transform="rotate(120 50 50)" />
    </g>
  ),
  lightbulb: (
    <g>
      <circle cx="50" cy="40" r="28" fill="#FFD700" opacity="0.9" />
      <rect x="38" y="65" width="24" height="8" rx="4" fill="#999" />
      <rect x="38" y="72" width="24" height="8" rx="4" fill="#aaa" />
      <line x1="50" y1="5" x2="50" y2="15" stroke="#FFD700" strokeWidth="3" />
      <line x1="20" y1="15" x2="28" y2="22" stroke="#FFD700" strokeWidth="3" />
      <line x1="80" y1="15" x2="72" y2="22" stroke="#FFD700" strokeWidth="3" />
    </g>
  ),
  calculator: (
    <g>
      <rect x="15" y="5" width="70" height="90" rx="8" fill="#2C3E50" />
      <rect x="22" y="12" width="56" height="28" rx="4" fill="#ECF0F1" />
      {[0,1,2,3].map((row) =>
        [0,1,2].map((col) => (
          <rect key={`${row}-${col}`} x={25 + col * 20} y={50 + row * 18} width="14" height="12" rx="3" fill="#3498DB" />
        ))
      )}
    </g>
  ),
  pencil: (
    <g>
      <rect x="42" y="5" width="16" height="70" rx="3" fill="#FFD700" />
      <polygon points="42,75 58,75 50,92" fill="#FFA500" />
      <rect x="42" y="5" width="16" height="12" rx="3" fill="#E74C3C" />
      <line x1="42" y1="17" x2="58" y2="17" stroke="#C0392B" strokeWidth="2" />
    </g>
  ),
  star: (
    <g>
      <polygon
        points="50,5 61,35 95,35 68,57 79,91 50,70 21,91 32,57 5,35 39,35"
        fill="#FFD700"
        stroke="#FFA500"
        strokeWidth="2"
      />
    </g>
  ),
};

export function EducationalObject({
  type = 'book',
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

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity,
        willChange: 'opacity, transform',
      }}
    >
      <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        {OBJECT_PATHS[type]}
      </svg>
    </div>
  );
}
