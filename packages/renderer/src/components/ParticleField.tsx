import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';

export interface ParticleFieldProps {
  seed?: number;
  count?: number;
  opacity?: number;
  color?: string;
}

function seeded(seed: number): number {
  const x = Math.sin(seed) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Slow ambient particles and blurred light orbs. Purely deterministic (frame +
 * seed), so renders are reproducible and cheap: no images, no randomness.
 */
export function ParticleField({
  seed = 1,
  count = 26,
  opacity = 0.5,
  color = '#ffffff',
}: ParticleFieldProps): React.ReactElement {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const dots = Array.from({ length: count }, (_, i) => {
    const r = (n: number): number => seeded(seed * 97 + i * 31 + n);
    const size = 4 + r(3) * 14;
    const x = r(1) * 100;
    const speed = 0.015 + r(4) * 0.05;
    const y = ((r(2) * 100 - frame * speed) % 100 + 100) % 100;
    const drift = Math.sin(frame * 0.008 + r(5) * 6.28) * 2.5;
    const twinkle = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(frame * 0.03 + r(6) * 6.28));
    return { size, x: x + drift, y, alpha: twinkle * r(7) };
  });

  const orbs = Array.from({ length: 3 }, (_, i) => {
    const r = (n: number): number => seeded(seed * 53 + i * 17 + n);
    const radius = width * (0.45 + r(1) * 0.35);
    const x = r(2) * 100 + Math.sin(frame * 0.006 + i) * 6;
    const y = r(3) * 100 + Math.cos(frame * 0.005 + i * 2) * 5;
    return { radius, x, y, alpha: 0.16 + r(4) * 0.12 };
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        opacity,
      }}
    >
      {orbs.map((orb, i) => (
        <div
          key={`orb-${i}`}
          style={{
            position: 'absolute',
            left: `${orb.x}%`,
            top: `${orb.y}%`,
            width: orb.radius,
            height: orb.radius,
            marginLeft: -orb.radius / 2,
            marginTop: -orb.radius / 2,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${color} 0%, ${color}00 70%)`,
            opacity: orb.alpha,
            filter: 'blur(30px)',
          }}
        />
      ))}
      {dots.map((dot, i) => (
        <div
          key={`dot-${i}`}
          style={{
            position: 'absolute',
            left: `${dot.x}%`,
            top: `${dot.y}%`,
            width: dot.size,
            height: dot.size,
            borderRadius: '50%',
            backgroundColor: color,
            opacity: dot.alpha,
            filter: `blur(${dot.size > 10 ? 3 : 0}px)`,
            transform: `translate3d(0, ${height * 0.001}px, 0)`,
          }}
        />
      ))}
    </div>
  );
}
