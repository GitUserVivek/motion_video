import React from 'react';
import { useCurrentFrame } from 'remotion';
import { fadeIn, slideIn, pop } from '../utils/animation.js';

export interface CalloutProps {
  text: string;
  target: { x: number; y: number };
  position?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  startFrame?: number;
  duration?: number;
  color?: string;
  backgroundColor?: string;
  fontSize?: number;
  arrow?: boolean;
}

export function Callout({
  text,
  target,
  position = 'auto',
  startFrame = 0,
  duration = 60,
  color = '#ffffff',
  backgroundColor = 'rgba(0, 0, 0, 0.8)',
  fontSize = 24,
  arrow = true,
}: CalloutProps): React.ReactElement {
  const frame = useCurrentFrame();

  const opacity = fadeIn(frame, startFrame, 20);
  const scale = pop(frame, startFrame);

  // Auto-detect position based on target location
  const detectedPosition = position === 'auto'
    ? (target.x < 30 ? 'right' : target.x > 70 ? 'left' : target.y < 30 ? 'bottom' : 'top')
    : position;

  // Calculate callout position
  const getPosition = () => {
    const padding = 20;
    const arrowSize = arrow ? 12 : 0;

    switch (detectedPosition) {
      case 'top':
        return {
          top: `${target.y - padding - arrowSize}%`,
          left: `${target.x}%`,
          transform: 'translateX(-50%) translateY(-100%)',
          arrow: { top: '100%', left: '50%', borderTop: '8px solid black' } as const,
        };
      case 'bottom':
        return {
          top: `${target.y + padding + arrowSize}%`,
          left: `${target.x}%`,
          transform: 'translateX(-50%) translateY(0)',
          arrow: { top: '-8px', left: '50%', borderBottom: '8px solid black' } as const,
        };
      case 'left':
        return {
          top: `${target.y}%`,
          left: `${target.x - padding - arrowSize}%`,
          transform: 'translateY(-50%) translateX(-100%)',
          arrow: { left: '100%', top: '50%', borderLeft: '8px solid black' } as const,
        };
      case 'right':
        return {
          top: `${target.y}%`,
          left: `${target.x + padding + arrowSize}%`,
          transform: 'translateY(-50%) translateX(0)',
          arrow: { left: '-8px', top: '50%', borderRight: '8px solid black' } as const,
        };
      default:
        return {
          top: `${target.y - padding - arrowSize}%`,
          left: `${target.x}%`,
          transform: 'translateX(-50%) translateY(-100%)',
          arrow: { top: '100%', left: '50%', borderTop: '8px solid black' } as const,
        };
    }
  };

  const pos = getPosition();

  return (
    <div
      style={{
        position: 'absolute',
        top: pos.top,
        left: pos.left,
        transform: `${pos.transform} scale(${scale})`,
        opacity,
        willChange: 'transform, opacity',
      }}
    >
      {/* Callout bubble */}
      <div
        style={{
          background: backgroundColor,
          color,
          padding: '12px 20px',
          borderRadius: 12,
          fontSize,
          fontWeight: 600,
          textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
          whiteSpace: 'nowrap',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        }}
      >
        {text}
      </div>

      {/* Arrow */}
      {arrow && (
        <div
          style={{
            position: 'absolute',
            ...pos.arrow,
            width: 0,
            height: 0,
            borderStyle: 'solid',
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}
    </div>
  );
}
