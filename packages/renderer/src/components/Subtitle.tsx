import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { SubtitleEntry } from '@edumotion/shared';
import { accentAt, BORDER, FONTS, INK, PAPER, springIn } from '../utils/design.js';

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
  fontSize = 40,
  color = INK,
  backgroundColor = PAPER,
  bottom = '11.5%',
  padding = '17px 30px',
  maxWidth = '88%',
}: SubtitleProps): React.ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const currentMs = (frame / fps) * 1000;
  const activeEntry = entries.find(
    (entry) => currentMs >= entry.startMs && currentMs <= entry.endMs,
  );

  if (!activeEntry?.text) return <></> as React.ReactElement;

  // Long cues shrink instead of wrapping down into the meter.
  const length = activeEntry.text.length;
  const fittedFontSize = length > 120
    ? Math.round(fontSize * 0.66)
    : length > 80
      ? Math.round(fontSize * 0.78)
      : length > 55
        ? Math.round(fontSize * 0.9)
        : fontSize;

  const cueStart = (activeEntry.startMs / 1000) * fps;
  const appear = springIn(frame, fps, cueStart, { damping: 15, stiffness: 170, mass: 0.6 });
  const rise = (1 - appear) * 20;

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    bottom,
    left: '50%',
    transform: `translateX(-50%) translateY(${rise}px) scale(${0.94 + Math.min(1, appear) * 0.06})`,
    background: backgroundColor,
    color,
    fontSize: fittedFontSize,
    fontFamily: FONTS.body,
    fontWeight: 800,
    textAlign: 'center',
    padding,
    borderRadius: 16,
    border: BORDER,
    boxShadow: '8px 8px 0 #111111',
    maxWidth,
    lineHeight: 1.24,
    opacity: Math.min(1, Math.max(0, appear)),
    userSelect: 'none',
    zIndex: 40,
    letterSpacing: -0.3,
  };

  const words = activeEntry.words;
  if (words && words.length > 0) {
    return (
      <div style={containerStyle}>
        {words.map((word, index) => {
          const speaking = currentMs >= word.startMs && currentMs < word.endMs;
          const spoken = currentMs >= word.endMs;

          return (
            <span
              key={`${word.text}-${index}`}
              style={{
                display: 'inline-block',
                marginRight: '0.27em',
                color: speaking ? accentAt(2) : color,
                opacity: spoken && !speaking ? 0.6 : 1,
                transform: speaking ? 'translateY(-2px) scale(1.02)' : 'none',
              }}
            >
              {word.text}
            </span>
          );
        })}
      </div>
    );
  }

  return <div style={containerStyle}>{activeEntry.text}</div>;
}
