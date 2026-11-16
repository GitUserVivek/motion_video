import React from 'react';
import { useCurrentFrame } from 'remotion';

export interface ConfettiProps {
  count?: number;
  startFrame?: number;
  colors?: string[];
}

const DEFAULT_COLORS = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8'];

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function Confetti({
  count = 40,
  startFrame = 0,
  colors = DEFAULT_COLORS,
}: ConfettiProps): React.ReactElement {
  const frame = useCurrentFrame();

  if (frame < startFrame) return <></> as React.ReactElement;

  const elapsed = frame - startFrame;

  const particles = Array.from({ length: count }, (_, i) => {
    const x = seededRandom(i * 7 + 1) * 100;
    const startY = -(seededRandom(i * 3 + 2) * 20);
    const speed = seededRandom(i * 5 + 3) * 3 + 1;
    const y = startY + elapsed * speed;
    const rotation = elapsed * (seededRandom(i * 11 + 4) * 10 - 5);
    const color = colors[Math.floor(seededRandom(i * 13 + 5) * colors.length)] ?? colors[0];
    const size = seededRandom(i * 17 + 6) * 15 + 8;
    const opacity = Math.max(0, 1 - (elapsed - 60) / 60);

    return { x, y, rotation, color, size, opacity: opacity > 0 ? opacity : 1 };
  });

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size * 0.5,
            backgroundColor: p.color,
            borderRadius: '2px',
            transform: `rotate(${p.rotation}deg)`,
            opacity: p.opacity,
          }}
        />
      ))}
    </div>
  );
}
