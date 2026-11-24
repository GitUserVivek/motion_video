import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { fitFontSize } from '@edumotion/shared';
import {
  accentAt,
  BORDER,
  CARD_SHADOW,
  FONTS,
  INK,
  PAPER,
  springIn,
  STICKER_SHADOW,
} from '../utils/design.js';

export interface EndScreenProps {
  title?: string;
  /** Legacy model-authored alias for title. */
  text?: string;
  subtitle?: string;
  primaryColor?: string;
  accentColor?: string;
  showConfetti?: boolean;
  startFrame?: number;
  logoText?: string;
  /** Short recap chips, e.g. "FACES 6". */
  chips?: string[];
  kicker?: string;
}

/**
 * The closing frame is a poster: a sticker, a headline that fills the width,
 * a row of recap chips and a small field-note credit. No logo glow.
 */
export function EndScreen({
  title,
  text,
  subtitle = 'Subscribe for more educational videos',
  accentColor = accentAt(1),
  startFrame = 0,
  logoText = 'EduMotion',
  chips = [],
  kicker = 'RECAP',
}: EndScreenProps): React.ReactElement {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const displayTitle = title?.trim() || text?.trim() || 'Thanks for Watching!';
  const titleAppear = springIn(frame, fps, startFrame, { damping: 16, stiffness: 120 });
  const subtitleAppear = springIn(frame, fps, startFrame + 12, { damping: 17, stiffness: 130 });
  const titleSize = fitFontSize(displayTitle, Math.max(360, width * 0.86 - 60), 132, 112, 54);

  return (
    <div
      style={{
        position: 'absolute',
        left: '7%',
        right: '7%',
        top: '16%',
        bottom: '21%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        color: INK,
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          background: accentColor,
          border: BORDER,
          borderRadius: 10,
          boxShadow: STICKER_SHADOW,
          color: INK,
          fontFamily: FONTS.display,
          fontSize: 25,
          fontWeight: 900,
          letterSpacing: 1.2,
          lineHeight: 1,
          padding: '10px 22px',
          textTransform: 'uppercase',
          transform: `rotate(-2deg) translateY(${(1 - titleAppear) * 20}px)`,
          opacity: Math.min(1, Math.max(0, titleAppear)),
        }}
      >
        {kicker}
      </div>

      <div
        style={{
          marginTop: 28,
          width: '100%',
          fontFamily: FONTS.display,
          fontSize: titleSize,
          fontWeight: 900,
          letterSpacing: -3.4,
          lineHeight: 0.88,
          textTransform: 'uppercase',
          transform: `translateY(${(1 - titleAppear) * 30}px)`,
          opacity: Math.min(1, Math.max(0, titleAppear)),
          overflowWrap: 'anywhere',
        }}
      >
        {displayTitle}
      </div>

      <div
        style={{
          marginTop: 24,
          maxWidth: '92%',
          color: 'rgba(17,17,17,0.72)',
          fontFamily: FONTS.body,
          fontSize: 34,
          fontWeight: 800,
          lineHeight: 1.2,
          transform: `translateY(${(1 - subtitleAppear) * 22}px)`,
          opacity: Math.min(1, Math.max(0, subtitleAppear)),
        }}
      >
        {subtitle}
      </div>

      {chips.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 14,
            marginTop: 34,
            width: '100%',
          }}
        >
          {chips.slice(0, 4).map((chip, index) => {
            const chipAppear = springIn(frame, fps, startFrame + 20 + index * 6, {
              damping: 15,
              stiffness: 170,
            });
            return (
              <div
                key={`${chip}-${index}`}
                style={{
                  background: accentAt(index),
                  border: BORDER,
                  borderRadius: 10,
                  boxShadow: '6px 6px 0 #111111',
                  color: INK,
                  fontFamily: FONTS.display,
                  fontSize: 24,
                  fontWeight: 900,
                  letterSpacing: 0.4,
                  lineHeight: 1,
                  padding: '12px 16px',
                  textTransform: 'uppercase',
                  transform: `translateY(${(1 - chipAppear) * 20}px) rotate(${index % 2 === 0 ? -1.4 : 1.4}deg)`,
                  opacity: Math.min(1, Math.max(0, chipAppear)),
                }}
              >
                {chip}
              </div>
            );
          })}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 48,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          color: INK,
          fontFamily: FONTS.mono,
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          opacity: Math.min(1, Math.max(0, subtitleAppear)),
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 12,
            height: 12,
            background: accentAt(2),
            border: `3px solid ${INK}`,
            transform: 'rotate(45deg)',
          }}
        />
        {logoText} / Field Notes
      </div>
    </div>
  );
}
