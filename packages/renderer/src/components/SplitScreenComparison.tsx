import React from 'react';
import { Img, useCurrentFrame, useVideoConfig } from 'remotion';
import { fitFontSize } from '@edumotion/shared';
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

export interface SplitScreenComparisonProps {
  left?: {
    content: React.ReactNode | string;
    label?: string;
    color?: string;
    /** Caption-specific artwork inlined as a data URL. */
    image?: string;
  };
  right?: {
    content: React.ReactNode | string;
    label?: string;
    color?: string;
    /** Caption-specific artwork inlined as a data URL. */
    image?: string;
  };
  /** Legacy model-authored aliases; still accepted so a scene never crashes. */
  leftTitle?: string;
  rightTitle?: string;
  comparisonLabel?: string;
  startFrame?: number;
  duration?: number;
}

function splitContent(content: React.ReactNode | string): { title: string; details: string[] } {
  if (typeof content !== 'string') return { title: '', details: [] };
  const [head, ...rest] = content.split(':');
  const title = (head ?? '').trim();
  const detailText = rest.join(':').trim();
  const details = detailText
    .split(/[,;]+/)
    .map((detail) => detail.trim())
    .filter(Boolean);
  return { title, details };
}

function ComparisonCard({
  side,
  content,
  label,
  color,
  image,
  startFrame,
}: {
  side: 'left' | 'right';
  content: React.ReactNode | string;
  label?: string;
  color: string;
  image?: string;
  startFrame: number;
}): React.ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const appear = springIn(frame, fps, startFrame, { damping: 16, stiffness: 120 });
  const parsed = splitContent(content);
  const title = parsed.title || (side === 'left' ? 'LEFT' : 'RIGHT');
  const isNode = typeof content !== 'string';

  return (
    <div
      style={{
        position: 'relative',
        width: '46%',
        minHeight: 560,
        background: color,
        border: BORDER,
        borderRadius: 24,
        boxShadow: CARD_SHADOW,
        padding: '42px 22px 28px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: Math.min(1, Math.max(0, appear)),
        transform: `translateY(${(1 - appear) * 46}px) rotate(${side === 'left' ? -1.2 : 1.2}deg)`,
        willChange: 'transform, opacity',
      }}
    >
      {label ? (
        <div
          style={{
            position: 'absolute',
            top: -18,
            left: 18,
            background: PAPER,
            border: BORDER_THIN,
            borderRadius: 8,
            boxShadow: '4px 4px 0 #111111',
            color: INK,
            fontFamily: FONTS.mono,
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: 0.8,
            lineHeight: 1,
            padding: '6px 9px',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </div>
      ) : null}

      {image ? (
        <Img
          src={image}
          style={{
            width: 190,
            height: 190,
            objectFit: 'contain',
            marginBottom: 12,
          }}
        />
      ) : null}

      <div
        style={{
          width: '100%',
          color: INK,
          fontFamily: FONTS.display,
          fontSize: fitFontSize(title, 380, 54, 54, 28),
          fontWeight: 900,
          letterSpacing: -1.8,
          lineHeight: 0.93,
          textAlign: 'center',
          textTransform: 'uppercase',
          overflowWrap: 'anywhere',
        }}
      >
        {title}
      </div>

      {isNode ? (
        <div style={{ width: '100%', marginTop: 20 }}>{content}</div>
      ) : parsed.details.length > 0 ? (
        <div
          style={{
            width: '100%',
            marginTop: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {parsed.details.map((detail, index) => (
            <div
              key={`${detail}-${index}`}
              style={{
                background: PAPER,
                border: BORDER_THIN,
                borderRadius: 9,
                boxShadow: '4px 4px 0 #111111',
                color: INK,
                fontFamily: FONTS.body,
                fontSize: 24,
                fontWeight: 800,
                lineHeight: 1.15,
                padding: '9px 12px',
                textAlign: 'center',
                overflowWrap: 'anywhere',
              }}
            >
              {detail}
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            marginTop: 20,
            color: INK,
            fontFamily: FONTS.body,
            fontSize: 24,
            fontWeight: 700,
            lineHeight: 1.25,
            textAlign: 'center',
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
}

/**
 * Two physical comparison cards, not a translucent split screen. Each side is
 * a sticker sheet with its own title and facts; the VS badge is the only thing
 * in the middle.
 */
export function SplitScreenComparison({
  left,
  right,
  leftTitle,
  rightTitle,
  comparisonLabel = 'vs',
  startFrame = 0,
}: SplitScreenComparisonProps): React.ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const badge = springIn(frame, fps, startFrame + 18, { damping: 14, stiffness: 180 });
  const leftContent = left?.content ?? leftTitle ?? 'Left';
  const rightContent = right?.content ?? rightTitle ?? 'Right';

  return (
    <div
      style={{
        position: 'absolute',
        top: '52%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '92%',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
        gap: 18,
      }}
    >
      <ComparisonCard
        side="left"
        content={leftContent}
        label={left?.label}
        color={left?.color ?? accentAt(0)}
        image={left?.image}
        startFrame={startFrame}
      />

      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) rotate(-6deg) scale(${0.7 + Math.min(1, badge) * 0.3})`,
          opacity: Math.min(1, Math.max(0, badge)),
          zIndex: 5,
          background: accentAt(1),
          border: BORDER,
          borderRadius: 12,
          boxShadow: STICKER_SHADOW,
          color: INK,
          fontFamily: FONTS.display,
          fontSize: 34,
          fontWeight: 900,
          letterSpacing: 1,
          lineHeight: 1,
          padding: '12px 18px',
          textTransform: 'uppercase',
        }}
      >
        {comparisonLabel}
      </div>

      <ComparisonCard
        side="right"
        content={rightContent}
        label={right?.label}
        color={right?.color ?? accentAt(2)}
        image={right?.image}
        startFrame={startFrame + 8}
      />
    </div>
  );
}
