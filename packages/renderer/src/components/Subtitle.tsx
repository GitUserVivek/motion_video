import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { fadeIn } from '../utils/animation.js';
import type { SubtitleEntry } from '@edumotion/shared';

export interface SubtitleProps {
  entries: SubtitleEntry[];
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  bottom?: string;
  padding?: string;
  maxWidth?: string;
}

export function Subtitle({
  entries,
  fontSize = 44,
  color = '#ffffff',
  backgroundColor = 'rgba(0,0,0,0.7)',
  bottom = '8%',
  padding = '16px 32px',
  maxWidth = '85%',
}: SubtitleProps): React.ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const currentMs = (frame / fps) * 1000;

  const activeEntry = entries.find(
    (e) => currentMs >= e.startMs && currentMs <= e.endMs,
  );

  if (!activeEntry?.text) return <></> as React.ReactElement;

  // Each cue animates in on its own first frame, so captions change with a beat
  // instead of blinking from one sentence to the next.
  const cueStart = (activeEntry.startMs / 1000) * fps;
  const opacity = fadeIn(frame, cueStart, 10);
  const rise = interpolate(frame, [cueStart, cueStart + 12], [24, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        bottom,
        left: '50%',
        transform: `translateX(-50%) translateY(${rise}px)`,
        backgroundColor,
        color,
        fontSize,
        fontFamily: '\'Segoe UI\', system-ui, sans-serif',
        fontWeight: 600,
        textAlign: 'center',
        padding,
        borderRadius: '8px',
        maxWidth,
        lineHeight: 1.4,
        opacity,
        userSelect: 'none',
        borderLeft: '4px solid rgba(255,215,0,0.9)',
      }}
    >
      {activeEntry.text}
    </div>
  );
}
