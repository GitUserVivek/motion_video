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

  // Long cues shrink instead of wrapping down into the graphic area.
  const length = activeEntry.text.length;
  const fittedFontSize = length > 120
    ? Math.round(fontSize * 0.68)
    : length > 80
      ? Math.round(fontSize * 0.8)
      : fontSize;

  // Each cue animates in on its own first frame, so captions change with a beat
  // instead of blinking from one sentence to the next.
  const cueStart = (activeEntry.startMs / 1000) * fps;
  const opacity = fadeIn(frame, cueStart, 10);
  const rise = interpolate(frame, [cueStart, cueStart + 12], [24, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    bottom,
    left: '50%',
    transform: `translateX(-50%) translateY(${rise}px)`,
    backgroundColor,
    color,
    fontSize: fittedFontSize,
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
  };

  // Word-level timing: the phrase stays on screen and the word being spoken is
  // highlighted, which reads far better than one word flashing at a time.
  const words = activeEntry.words;
  if (words && words.length > 0) {
    return (
      <div style={containerStyle}>
        {words.map((word, i) => {
          const speaking = currentMs >= word.startMs && currentMs < word.endMs;
          const spoken = currentMs >= word.endMs;

          return (
            <span
              key={`${word.text}-${i}`}
              style={{
                display: 'inline-block',
                marginRight: '0.28em',
                color: speaking ? '#FFE066' : color,
                opacity: spoken && !speaking ? 0.82 : 1,
                transform: speaking ? 'translateY(-2px)' : 'none',
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
