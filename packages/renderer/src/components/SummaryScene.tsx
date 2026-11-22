import React from 'react';
import { fadeIn, slideIn } from '../utils/animation.js';
import { useCurrentFrame } from 'remotion';

/**
 * A recap card list: the scene where the video collects the points it just made.
 *
 * A summary used to look exactly like every other scene (heading + icon), which
 * made the ending feel like the middle. Here each point arrives on its own beat
 * in a numbered row, so the viewer can read the video's own takeaway.
 */

export interface SummarySceneProps {
  title?: string;
  points?: string[];
  badgeText?: string;
  accent?: string;
  top?: string;
  left?: string;
  startFrame?: number;
}

const MAX_POINTS = 5;

function safeInk(accent: string): string {
  return /^#[0-9a-f]{6}$/i.test(accent) ? accent : '#FFD166';
}

export function SummaryScene({
  title = 'In short',
  points = [],
  badgeText = 'Recap',
  accent = '#FFD166',
  top = '56%',
  left = '50%',
  startFrame = 0,
}: SummarySceneProps): React.ReactElement {
  const frame = useCurrentFrame();
  const ink = safeInk(accent);

  const list = points
    .map((point) => (typeof point === 'string' ? point.trim() : ''))
    .filter((point) => point.length > 0)
    .slice(0, MAX_POINTS);

  if (list.length === 0) return <></> as React.ReactElement;

  const headingAppear = fadeIn(frame, startFrame, 16);

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        width: '88%',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 14,
      }}
    >
      <div
        style={{
          alignSelf: 'center',
          padding: '5px 18px',
          borderRadius: 999,
          background: ink,
          color: '#101a30',
          fontSize: 18,
          fontWeight: 900,
          letterSpacing: 2,
          textTransform: 'uppercase',
          opacity: headingAppear,
        }}
      >
        {badgeText}
      </div>

      <div
        style={{
          marginBottom: 4,
          fontSize: 44,
          fontWeight: 800,
          lineHeight: 1.2,
          color: '#ffffff',
          textAlign: 'center',
          textShadow: '0 3px 16px rgba(0,0,0,0.5)',
          opacity: headingAppear,
        }}
      >
        {title}
      </div>

      {list.map((point, index) => {
        const appearAt = startFrame + 10 + index * 8;
        const appear = fadeIn(frame, appearAt, 14);
        const offset = slideIn(frame, 'left', appearAt, 16, 22);

        return (
          <div
            key={`summary-${index}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              padding: '16px 22px',
              borderRadius: 20,
              background: 'rgba(255,255,255,0.10)',
              border: '2px solid rgba(255,255,255,0.18)',
              boxShadow: '0 12px 30px rgba(4,10,26,0.28)',
              opacity: appear,
              transform: offset,
              willChange: 'opacity, transform',
            }}
          >
            <div
              style={{
                flexShrink: 0,
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: ink,
                color: '#101a30',
                fontSize: 24,
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {index + 1}
            </div>
            <div
              style={{
                fontSize: 29,
                fontWeight: 600,
                lineHeight: 1.25,
                color: '#f4f7ff',
                textShadow: '0 2px 8px rgba(0,0,0,0.4)',
              }}
            >
              {point}
            </div>
          </div>
        );
      })}
    </div>
  );
}
