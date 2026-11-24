import React from 'react';
import { Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { easeOut } from '../utils/animation.js';
import {
  accentAt,
  BORDER,
  BORDER_THIN,
  CARD_SHADOW,
  FONTS,
  INK,
  PAPER,
  springIn,
  STICKER_SHADOW,
} from '../utils/design.js';

/**
 * A comparison chart drawn like a printed infographic: one paper card, heavy
 * outlines, each bar a coloured sticker with a hard shadow. Values and labels
 * stay black on paper so the chart is readable without the caption.
 */

export interface ComparisonBar {
  label: string;
  value: number;
  suffix?: string;
}

export interface ComparisonChartProps {
  title?: string;
  /** Caption-specific artwork inlined as a data URL. */
  image?: string;
  bars?: ComparisonBar[];
  top?: string;
  left?: string;
  accent?: string;
  startFrame?: number;
}

const MAX_BARS = 4;

function formatValue(value: number, suffix: string): string {
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${rounded}${suffix}`;
}

export function ComparisonChart({
  title = '',
  image,
  bars = [],
  top = '56%',
  left = '50%',
  startFrame = 0,
}: ComparisonChartProps): React.ReactElement {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();

  const list = bars
    .filter((bar) => bar && Number.isFinite(bar.value) && bar.value >= 0)
    .slice(0, MAX_BARS);
  if (list.length === 0) return <></> as React.ReactElement;

  const chartHeight = Math.round(Math.max(260, Math.min(height * 0.3, 500)));
  const maxValue = Math.max(...list.map((bar) => bar.value), 1);
  const heading = title.trim();
  const panelAppear = springIn(frame, fps, startFrame, { damping: 18, stiffness: 120 });

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        width: '90%',
        padding: '30px 28px 24px',
        paddingRight: image ? 150 : 28,
        borderRadius: 24,
        background: PAPER,
        border: BORDER,
        boxShadow: CARD_SHADOW,
        transform: `translate(-50%, -50%) translateY(${(1 - panelAppear) * 28}px)`,
        opacity: Math.min(1, Math.max(0, panelAppear)),
      }}
    >
      {image ? (
        <div
          style={{
            position: 'absolute',
            top: 20,
            right: 20,
            width: 116,
            height: 116,
            background: PAPER,
            border: BORDER_THIN,
            borderRadius: 14,
            boxShadow: '5px 5px 0 #111111',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Img src={image} style={{ width: 96, height: 96, objectFit: 'contain' }} />
        </div>
      ) : null}

      {heading ? (
        <div
          style={{
            display: 'inline-flex',
            marginBottom: 24,
            background: accentAt(1),
            border: BORDER,
            borderRadius: 9,
            boxShadow: STICKER_SHADOW,
            color: INK,
            fontFamily: FONTS.display,
            fontSize: 25,
            fontWeight: 900,
            letterSpacing: 0.6,
            lineHeight: 1,
            padding: '10px 18px',
            textTransform: 'uppercase',
            transform: 'rotate(-1.5deg)',
          }}
        >
          {heading}
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-around',
          gap: 18,
          height: chartHeight,
          borderBottom: BORDER,
          paddingBottom: 0,
        }}
      >
        {list.map((bar, index) => {
          const appearAt = startFrame + 8 + index * 8;
          const targetHeight = (bar.value / maxValue) * (chartHeight - 56);
          const grown = interpolate(
            frame,
            [appearAt, appearAt + 26],
            [0, Math.max(10, targetHeight)],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut },
          );
          const appear = springIn(frame, fps, appearAt, { damping: 16, stiffness: 130 });
          const suffix = bar.suffix ?? '';

          return (
            <div
              key={`bar-${index}`}
              style={{
                flex: 1,
                maxWidth: 190,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                opacity: Math.min(1, Math.max(0, appear)),
              }}
            >
              <div
                style={{
                  marginBottom: 10,
                  color: INK,
                  fontFamily: FONTS.display,
                  fontSize: 30,
                  fontWeight: 900,
                  letterSpacing: -0.8,
                  lineHeight: 1,
                }}
              >
                {formatValue(bar.value, suffix)}
              </div>
              <div
                style={{
                  width: '78%',
                  height: grown,
                  background: accentAt(index),
                  border: BORDER,
                  borderRadius: '12px 12px 0 0',
                  boxShadow: '5px -5px 0 #111111',
                  willChange: 'height',
                }}
              />
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-around', gap: 18, marginTop: 14 }}>
        {list.map((bar, index) => (
          <div
            key={`label-${index}`}
            style={{
              flex: 1,
              maxWidth: 190,
              color: INK,
              fontFamily: FONTS.body,
              fontSize: 19,
              fontWeight: 800,
              lineHeight: 1.15,
              textAlign: 'center',
              overflowWrap: 'anywhere',
              textTransform: 'uppercase',
              opacity: Math.min(1, Math.max(0, springIn(frame, fps, startFrame + 12 + index * 8, { damping: 18, stiffness: 140 }))),
            }}
          >
            {bar.label}
          </div>
        ))}
      </div>
    </div>
  );
}
