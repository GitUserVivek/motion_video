import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
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

  return (
    <div
      style={{
        position: 'absolute',
        bottom,
        left: '50%',
        transform: 'translateX(-50%)',
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
        userSelect: 'none',
      }}
    >
      {activeEntry.text}
    </div>
  );
}
