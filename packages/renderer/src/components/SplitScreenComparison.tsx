import React from 'react';
import { useCurrentFrame, AbsoluteFill } from 'remotion';
import { fadeIn, slideIn } from '../utils/animation.js';

export interface SplitScreenComparisonProps {
  left: {
    content: React.ReactNode | string;
    label?: string;
    color?: string;
  };
  right: {
    content: React.ReactNode | string;
    label?: string;
    color?: string;
  };
  comparisonLabel?: string;
  startFrame?: number;
  duration?: number;
}

export function SplitScreenComparison({
  left,
  right,
  comparisonLabel = 'vs',
  startFrame = 0,
  duration = 120,
}: SplitScreenComparisonProps): React.ReactElement {
  const frame = useCurrentFrame();
  const progress = Math.min(1, Math.max(0, (frame - startFrame) / duration));

  const leftOpacity = fadeIn(frame, startFrame, 20);
  const rightOpacity = fadeIn(frame, startFrame + 10, 20);
  const labelOpacity = fadeIn(frame, startFrame + 20, 20);

  // Divider line animation
  const dividerProgress = slideIn(frame, startFrame + 30, 15);

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {/* Left side */}
      <AbsoluteFill
        style={{
          width: '50%',
          left: 0,
          justifyContent: 'center',
          alignItems: 'center',
          opacity: leftOpacity,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 20,
          }}
        >
          {typeof left.content === 'string' ? (
            <div
              style={{
                fontSize: 48,
                fontWeight: 'bold',
                color: left.color || '#4A90D9',
                textAlign: 'center',
                maxWidth: '80%',
              }}
            >
              {left.content}
            </div>
          ) : (
            left.content
          )}
          {left.label && (
            <div
              style={{
                fontSize: 28,
                color: '#eef2ff',
                textAlign: 'center',
              }}
            >
              {left.label}
            </div>
          )}
        </div>
      </AbsoluteFill>

      {/* Right side */}
      <AbsoluteFill
        style={{
          width: '50%',
          left: '50%',
          justifyContent: 'center',
          alignItems: 'center',
          opacity: rightOpacity,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 20,
          }}
        >
          {typeof right.content === 'string' ? (
            <div
              style={{
                fontSize: 48,
                fontWeight: 'bold',
                color: right.color || '#E74C3C',
                textAlign: 'center',
                maxWidth: '80%',
              }}
            >
              {right.content}
            </div>
          ) : (
            right.content
          )}
          {right.label && (
            <div
              style={{
                fontSize: 28,
                color: '#eef2ff',
                textAlign: 'center',
              }}
            >
              {right.label}
            </div>
          )}
        </div>
      </AbsoluteFill>

      {/* Divider line with label */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
          opacity: labelOpacity,
        }}
      >
        <div
          style={{
            width: 4,
            height: 200,
            background: 'linear-gradient(to bottom, rgba(255,255,255,0.8), rgba(255,255,255,0.4))',
            borderRadius: 2,
          }}
        />
        <div
          style={{
            fontSize: 32,
            fontWeight: 'bold',
            color: '#ffffff',
            background: 'rgba(0,0,0,0.5)',
            padding: '8px 24px',
            borderRadius: 20,
            textTransform: 'uppercase',
            letterSpacing: 2,
          }}
        >
          {comparisonLabel}
        </div>
      </div>

      {/* Animated highlight that moves across */}
      <div
        style={{
          position: 'absolute',
          left: `${50 - 50 * dividerProgress}%`,
          top: 0,
          width: '50%',
          height: '100%',
          pointerEvents: 'none',
          background: 'radial-gradient(circle at center, rgba(255,255,255,0.1) 0%, transparent 70%)',
        }}
      />
    </AbsoluteFill>
  );
}
