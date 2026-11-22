import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { easeOut, fadeIn } from '../utils/animation.js';

/**
 * A small bar chart that compares two to four measured values.
 *
 * Scenes about numbers used to show one big digit, which says nothing about how
 * the values relate. This draws the comparison itself: each bar grows on its own
 * beat, the value is printed above it and the label comes from the narration, so
 * the chart is readable without the caption.
 */

export interface ComparisonBar {
  label: string;
  value: number;
  suffix?: string;
}

export interface ComparisonChartProps {
  title?: string;
  bars?: ComparisonBar[];
  top?: string;
  left?: string;
  accent?: string;
  startFrame?: number;
}

const MAX_BARS = 4;

function safeInk(accent: string): string {
  return /^#[0-9a-f]{6}$/i.test(accent) ? accent : '#FFD166';
}

function formatValue(value: number, suffix: string): string {
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${rounded}${suffix}`;
}

export function ComparisonChart({
  title = '',
  bars = [],
  top = '56%',
  left = '50%',
  accent = '#FFD166',
  startFrame = 0,
}: ComparisonChartProps): React.ReactElement {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();

  const list = bars
    .filter((bar) => bar && Number.isFinite(bar.value) && bar.value >= 0)
    .slice(0, MAX_BARS);
  if (list.length === 0) return <></> as React.ReactElement;

  const ink = safeInk(accent);
  const chartHeight = Math.round(Math.max(240, Math.min(height * 0.32, 520)));
  const maxValue = Math.max(...list.map((bar) => bar.value), 1);
  const heading = title.trim();

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        width: '88%',
        padding: '28px 26px 22px',
        borderRadius: 30,
        background: 'rgba(8,14,30,0.42)',
        border: '2px solid rgba(255,255,255,0.16)',
        boxShadow: '0 24px 60px rgba(4,10,26,0.35)',
        transform: 'translate(-50%, -50%)',
      }}
    >
      {heading ? (
        <div
          style={{
            marginBottom: 22,
            fontSize: 34,
            fontWeight: 800,
            color: '#ffffff',
            textAlign: 'center',
            textShadow: '0 3px 14px rgba(0,0,0,0.5)',
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
          gap: 20,
          height: chartHeight,
        }}
      >
        {list.map((bar, index) => {
          const appearAt = startFrame + index * 8;
          const targetHeight = (bar.value / maxValue) * (chartHeight - 46);
          const grown = interpolate(
            frame,
            [appearAt, appearAt + 26],
            [0, Math.max(10, targetHeight)],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut },
          );
          const appear = fadeIn(frame, appearAt, 14);
          const suffix = bar.suffix ?? '';

          return (
            <div
              key={`bar-${index}`}
              style={{
                flex: 1,
                maxWidth: 200,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                opacity: appear,
              }}
            >
              <div
                style={{
                  marginBottom: 10,
                  fontSize: 30,
                  fontWeight: 800,
                  color: ink,
                  textShadow: '0 2px 10px rgba(0,0,0,0.45)',
                }}
              >
                {formatValue(bar.value, suffix)}
              </div>
              <div
                style={{
                  width: '72%',
                  height: grown,
                  borderRadius: '12px 12px 6px 6px',
                  background: `linear-gradient(180deg, ${ink} 0%, ${ink}66 100%)`,
                  border: `2px solid ${ink}AA`,
                  boxShadow: `0 10px 28px ${ink}33`,
                  willChange: 'height',
                }}
              />
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-around', gap: 20, marginTop: 12 }}>
        {list.map((bar, index) => (
          <div
            key={`label-${index}`}
            style={{
              flex: 1,
              maxWidth: 200,
              fontSize: 21,
              fontWeight: 700,
              lineHeight: 1.25,
              color: '#eef2ff',
              textAlign: 'center',
              overflowWrap: 'anywhere',
              opacity: fadeIn(frame, startFrame + index * 8 + 12, 14),
            }}
          >
            {bar.label}
          </div>
        ))}
      </div>
    </div>
  );
}
