import React from 'react';
import { Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { easeOut, fadeIn } from '../utils/animation.js';
import { ICON_PATHS, type ObjectType } from '../utils/icons.js';

/**
 * The subject on screen, with labelled labels pointing at parts of it.
 *
 * This is the "annotated diagram" look of textbook illustrations: the artwork
 * stays centred, each label lives in the outer margin, and a leader line is
 * drawn from the label to a pulsing dot on the subject. Geometry is measured in
 * real pixels from `useVideoConfig`, so the same scene composes correctly in
 * portrait, landscape and square.
 */

export interface AnnotatedPoint {
  label: string;
  detail?: string;
  /** Dot position on the subject, in % of the frame. */
  x: number;
  y: number;
}

export interface AnnotatedCalloutProps {
  subject?: ObjectType;
  /** Optional artwork (data URL) drawn instead of the built-in glyph. */
  image?: string;
  points?: AnnotatedPoint[];
  accent?: string;
  startFrame?: number;
}

const MAX_POINTS = 3;

function safeInk(accent: string): string {
  return /^#[0-9a-f]{6}$/i.test(accent) ? accent : '#FFD166';
}

export function AnnotatedCallout({
  subject = 'book',
  image,
  points = [],
  accent = '#FFD166',
  startFrame = 0,
}: AnnotatedCalloutProps): React.ReactElement {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const list = points.slice(0, MAX_POINTS);
  if (list.length === 0) return <></> as React.ReactElement;

  const ink = safeInk(accent);
  const size = Math.round(Math.min(width, height) * 0.34);
  const cardWidth = Math.round(Math.min(440, Math.max(230, width * 0.31)));
  const margin = Math.round(width * 0.035);

  const subjectAppear = fadeIn(frame, startFrame, 18);
  const subjectScale = interpolate(frame, [startFrame, startFrame + 22], [0.9, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOut,
  });
  const pulse = 0.5 + 0.5 * Math.sin(Math.max(0, frame - startFrame) * 0.09);

  let leftSlot = 0;
  let rightSlot = 0;
  const rows = list.map((point, index) => {
    const side: 'left' | 'right' = point.x < 50 ? 'left' : 'right';
    const slot = side === 'left' ? leftSlot++ : rightSlot++;
    // Cards are anchored by their own centre, so a label of any height still
    // ends exactly on its leader line.
    const cardTop = 32 + slot * 24;
    const innerX = side === 'left' ? margin + cardWidth : width - margin - cardWidth;
    const dotX = (point.x / 100) * width;
    const dotY = (point.y / 100) * height;
    const cardY = (cardTop / 100) * height;
    const angle = (Math.atan2(cardY - dotY, innerX - dotX) * 180) / Math.PI;

    return {
      point,
      side,
      cardTop,
      dotX,
      dotY,
      angle,
      length: Math.hypot(innerX - dotX, cardY - dotY),
      appearAt: startFrame + 10 + index * 7,
    };
  });

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {rows.map((row, index) => {
        const draw = fadeIn(frame, row.appearAt, 12);
        return (
          <div
            key={`leader-${index}`}
            style={{
              position: 'absolute',
              left: row.dotX,
              top: row.dotY,
              width: row.length,
              height: 3,
              borderRadius: 2,
              background: `linear-gradient(90deg, ${ink}AA, ${ink}55)`,
              transformOrigin: 'left center',
              transform: `rotate(${row.angle}deg) scaleX(${draw})`,
              opacity: draw,
            }}
          />
        );
      })}

      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: size,
          height: size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          borderRadius: 44,
          background: 'rgba(255,255,255,0.12)',
          border: `3px solid ${ink}66`,
          boxShadow: `0 0 ${40 + pulse * 26}px ${ink}55`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: subjectAppear,
          transform: `scale(${subjectScale})`,
        }}
      >
        {image ? (
          <Img
            src={image}
            style={{ width: size * 0.72, height: size * 0.72, objectFit: 'contain' }}
          />
        ) : (
          <svg
            width={size * 0.72}
            height={size * 0.72}
            viewBox="0 0 100 100"
            xmlns="http://www.w3.org/2000/svg"
          >
            {ICON_PATHS[subject] ?? ICON_PATHS.book}
          </svg>
        )}
      </div>

      {rows.map((row, index) => {
        const appear = fadeIn(frame, row.appearAt, 14);
        const offset = (1 - appear) * (row.side === 'left' ? -22 : 22);

        return (
          <React.Fragment key={`point-${index}`}>
            <div
              style={{
                position: 'absolute',
                left: row.dotX,
                top: row.dotY,
                width: 46,
                height: 46,
                marginLeft: -23,
                marginTop: -23,
                borderRadius: '50%',
                border: `2px solid ${ink}`,
                opacity: appear * (0.3 + 0.45 * pulse),
                transform: `scale(${0.8 + 0.5 * pulse})`,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: row.dotX,
                top: row.dotY,
                width: 16,
                height: 16,
                marginLeft: -8,
                marginTop: -8,
                borderRadius: '50%',
                background: ink,
                boxShadow: `0 0 16px ${ink}`,
                opacity: appear,
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: `${row.cardTop}%`,
                ...(row.side === 'left' ? { left: margin } : { right: margin }),
                width: cardWidth,
                padding: '14px 18px',
                borderRadius: 16,
                background: 'rgba(9,16,34,0.62)',
                borderLeft: `6px solid ${ink}`,
                boxShadow: '0 12px 32px rgba(4,10,26,0.38)',
                opacity: appear,
                transform: `translateY(-50%) translateX(${offset}px)`,
              }}
            >
              <div style={{ fontSize: 28, fontWeight: 800, color: '#ffffff', lineHeight: 1.2 }}>
                {row.point.label}
              </div>
              {row.point.detail ? (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 19,
                    fontWeight: 500,
                    color: 'rgba(255,255,255,0.78)',
                    lineHeight: 1.3,
                  }}
                >
                  {row.point.detail}
                </div>
              ) : null}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
