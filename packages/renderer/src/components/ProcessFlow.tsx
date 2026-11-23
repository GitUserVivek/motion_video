import React from 'react';
import { Img, useCurrentFrame } from 'remotion';
import { fadeIn, pop } from '../utils/animation.js';
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

export function ProcessFlow({
  steps,
  direction = steps.length > 2 ? 'vertical' : 'horizontal',
  top = '50%',
  left = '50%',
  startFrame = 0,
  stepSpacing = 96,
}: ProcessFlowProps): React.ReactElement {
  const frame = useCurrentFrame();

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    top,
    left,
    transform: 'translate(-50%, -50%)',
    width: '92%',
    display: 'flex',
    flexDirection: direction === 'horizontal' ? 'row' : 'column',
    flexWrap: direction === 'horizontal' ? 'wrap' : 'nowrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: stepSpacing,
  };

  return (
    <div style={containerStyle}>
      {steps.map((step, index) => {
        const appearFrame = startFrame + index * 15;
        const opacity = fadeIn(frame, appearFrame, 20);
        const scale = pop(frame, appearFrame);

        const isActive = frame >= appearFrame && frame < appearFrame + 60;

        return (
          <React.Fragment key={`step-${index}`}>
            {/* Step container */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                opacity,
                transform: `scale(${scale})`,
                willChange: 'opacity, transform',
              }}
            >
              {/* Step circle */}
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  background: step.color || '#4A90D9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: isActive
                    ? '0 0 30px rgba(255,255,255,0.8)'
                    : '0 0 15px rgba(0,0,0,0.3)',
                  transition: 'box-shadow 0.3s ease',
                }}
              >
                {step.image ? (
                  <Img
                    src={step.image}
                    style={{ width: 56, height: 56, objectFit: 'contain' }}
                  />
                ) : step.iconName ? (
                  <svg width={50} height={50} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                    {ICON_PATHS[step.iconName] ?? ICON_PATHS.book}
                  </svg>
                ) : step.icon || (
                  <span
                    style={{
                      fontSize: 36,
                      fontWeight: 'bold',
                      color: '#ffffff',
                    }}
                  >
                    {index + 1}
                  </span>
                )}
              </div>

              {/* Step label */}
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: '#eef2ff',
                  textAlign: 'center',
                  textShadow: '0 2px 8px rgba(0,0,0,0.6)',
                }}
              >
                {step.label}
              </div>

              {/* Step description */}
              {step.description && (
                <div
                  style={{
                    fontSize: 16,
                    color: 'rgba(255,255,255,0.7)',
                    textAlign: 'center',
                    maxWidth: 200,
                  }}
                >
                  {step.description}
                </div>
              )}
            </div>

            {/* Connector line (not for last step) */}
            {index < steps.length - 1 && direction === 'horizontal' && (
              <div
                style={{
                  width: stepSpacing - 40,
                  height: 4,
                  background: 'linear-gradient(to right, rgba(255,255,255,0.4), rgba(255,255,255,0.1))',
                  borderRadius: 2,
                  marginBottom: 40,
                  opacity: fadeIn(frame, appearFrame + 10, 15),
                }}
              />
            )}

            {index < steps.length - 1 && direction === 'vertical' && (
              <div
                style={{
                  width: 4,
                  height: stepSpacing - 40,
                  background: 'linear-gradient(to bottom, rgba(255,255,255,0.4), rgba(255,255,255,0.1))',
                  borderRadius: 2,
                  opacity: fadeIn(frame, appearFrame + 10, 15),
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
