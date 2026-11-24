import React from 'react';
import { Img, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  accentAt,
  BORDER,
  BORDER_THIN,
  CARD_SHADOW,
  CARD_SHADOW_SM,
  FONTS,
  INK,
  PAPER,
  springIn,
} from '../utils/design.js';
import { ICON_PATHS, type ObjectType } from '../utils/icons.js';

export interface ProcessStep {
  label: string;
  /** Caption-specific artwork inlined as a data URL. */
  image?: string;
  /** Colourful built-in glyph used when no downloaded image matched. */
  iconName?: ObjectType;
  icon?: React.ReactNode;
  description?: string;
  color?: string;
}

export interface ProcessFlowProps {
  steps: ProcessStep[];
  direction?: 'horizontal' | 'vertical';
  top?: string;
  left?: string;
  startFrame?: number;
  stepSpacing?: number;
}

function FlowArrow({
  direction,
  appearAt,
}: {
  direction: 'horizontal' | 'vertical';
  appearAt: number;
}): React.ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const draw = springIn(frame, fps, appearAt, { damping: 18, stiffness: 150 });

  if (direction === 'horizontal') {
    return (
      <svg
        width={42}
        height={42}
        viewBox="0 0 42 42"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0, opacity: draw }}
      >
        <path
          d="M4 21 H36"
          stroke={INK}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray="32"
          strokeDashoffset={32 * (1 - draw)}
        />
        <path d="M27 10 L38 21 L27 32" stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg
      width={34}
      height={34}
      viewBox="0 0 34 34"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, opacity: draw }}
    >
      <path
        d="M17 2 V27"
        stroke={INK}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="25"
        strokeDashoffset={25 * (1 - draw)}
      />
      <path d="M7 20 L17 30 L27 20" stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * A sequence of steps as physical paper cards. Number badges do the work that
 * the old glowing circles tried to do, and the arrows are drawn, not faked with
 * a divider line.
 */
export function ProcessFlow({
  steps,
  direction = steps.length > 2 ? 'vertical' : 'horizontal',
  top = '58%',
  left = '50%',
  startFrame = 0,
}: ProcessFlowProps): React.ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vertical = direction === 'vertical';
  const safeSteps = steps.length > 0 ? steps : [];
  const activeIndex = Math.floor(Math.max(0, frame - startFrame) / 34) % Math.max(1, safeSteps.length);

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    top,
    left,
    transform: 'translate(-50%, -50%)',
    width: vertical ? '88%' : '94%',
    maxWidth: vertical ? 900 : undefined,
    display: 'flex',
    flexDirection: vertical ? 'column' : 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: vertical ? 16 : 12,
  };

  return (
    <div style={containerStyle}>
      {safeSteps.map((step, index) => {
        const appear = springIn(frame, fps, startFrame + index * 9, {
          damping: 16,
          stiffness: 125,
        });
        const color = step.color ?? accentAt(index);
        const active = index === activeIndex;
        const iconBox = vertical ? 92 : 82;

        return (
          <React.Fragment key={`step-${index}`}>
            {index > 0 ? (
              <FlowArrow direction={vertical ? 'vertical' : 'horizontal'} appearAt={startFrame + index * 9 - 4} />
            ) : null}

            <div
              style={{
                width: vertical ? '100%' : '100%',
                maxWidth: vertical ? 880 : 430,
                minHeight: vertical ? 142 : 176,
                background: active ? '#FFF3C4' : PAPER,
                border: BORDER,
                borderRadius: 18,
                boxShadow: active ? CARD_SHADOW : CARD_SHADOW_SM,
                padding: vertical ? '20px 26px' : '22px 24px',
                display: 'flex',
                flexDirection: vertical ? 'row' : 'column',
                alignItems: 'center',
                textAlign: vertical ? 'left' : 'center',
                gap: vertical ? 22 : 10,
                opacity: Math.min(1, Math.max(0, appear)),
                transform: `translateY(${(1 - appear) * 28}px) translateX(${active ? 5 : 0}px) rotate(${index % 2 === 0 ? -0.5 : 0.5}deg)`,
                willChange: 'transform, opacity',
              }}
            >
              <div
                style={{
                  width: iconBox,
                  height: iconBox,
                  flexShrink: 0,
                  background: color,
                  border: BORDER,
                  borderRadius: 14,
                  boxShadow: CARD_SHADOW_SM,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: 'rotate(-3deg)',
                }}
              >
                {step.image ? (
                  <Img
                    src={step.image}
                    style={{
                      width: iconBox * 0.78,
                      height: iconBox * 0.78,
                      objectFit: 'contain',
                    }}
                  />
                ) : step.iconName ? (
                  <svg
                    width={iconBox * 0.7}
                    height={iconBox * 0.7}
                    viewBox="0 0 100 100"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    {ICON_PATHS[step.iconName] ?? ICON_PATHS.book}
                  </svg>
                ) : step.icon ? (
                  step.icon
                ) : (
                  <span
                    style={{
                      color: INK,
                      fontFamily: FONTS.display,
                      fontSize: iconBox * 0.46,
                      fontWeight: 900,
                      lineHeight: 1,
                    }}
                  >
                    {index + 1}
                  </span>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0, width: vertical ? undefined : '100%' }}>
                <div
                  style={{
                    color: INK,
                    fontFamily: FONTS.display,
                    fontSize: vertical ? 30 : 25,
                    fontWeight: 900,
                    letterSpacing: -0.7,
                    lineHeight: 1.02,
                    textTransform: 'uppercase',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {step.label}
                </div>
                {step.description ? (
                  <div
                    style={{
                      marginTop: 7,
                      color: 'rgba(17,17,17,0.68)',
                      fontFamily: FONTS.body,
                      fontSize: vertical ? 20 : 17,
                      fontWeight: 700,
                      lineHeight: 1.25,
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {step.description}
                  </div>
                ) : null}
              </div>

              <div
                style={{
                  alignSelf: vertical ? 'center' : 'flex-start',
                  background: PAPER,
                  border: BORDER_THIN,
                  borderRadius: 8,
                  boxShadow: '3px 3px 0 #111111',
                  color: INK,
                  fontFamily: FONTS.mono,
                  fontSize: 15,
                  fontWeight: 700,
                  lineHeight: 1,
                  padding: '4px 7px',
                }}
              >
                {String(index + 1).padStart(2, '0')}
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
