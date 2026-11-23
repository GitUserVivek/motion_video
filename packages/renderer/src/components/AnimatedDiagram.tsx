import React from 'react';
import { Img, useCurrentFrame } from 'remotion';
import { fadeIn, slideIn, pop } from '../utils/animation.js';
import { ICON_PATHS, type ObjectType } from '../utils/icons.js';

export interface DiagramItem {
  icon: ObjectType;
  label: string;
  /** Caption-specific artwork inlined as a data URL. */
  image?: string;
  description?: string;
  position: { x: number; y: number };
  connections?: number[]; // Indices of items to connect to
}

export interface AnimatedDiagramProps {
  items?: DiagramItem[];
  /** A formula is a complete diagram on its own; no item positions needed. */
  equation?: string;
  title?: string;
  top?: string;
  left?: string;
  startFrame?: number;
  width?: number;
  height?: number;
}

export function AnimatedDiagram({
  items = [],
  equation,
  title,
  top = '50%',
  left = '50%',
  startFrame = 0,
  width = 600,
  height = 400,
}: AnimatedDiagramProps): React.ReactElement {
  const frame = useCurrentFrame();

  const centerX = width / 2;
  const centerY = height / 2;
  const formula = equation?.trim();

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        transform: 'translate(-50%, -50%)',
        width,
        height,
      }}
    >
      {/* Background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: 20,
          border: '2px solid rgba(255, 255, 255, 0.1)',
        }}
      />

      {/* Formula: a supported shape for equation-first model output. */}
      {formula ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 36,
            textAlign: 'center',
            fontSize: 46,
            fontWeight: 800,
            lineHeight: 1.35,
            letterSpacing: 1,
            color: '#ffffff',
            textShadow: '0 3px 18px rgba(0,0,0,0.65)',
            opacity: fadeIn(frame, startFrame, 20),
          }}
        >
          {formula}
        </div>
      ) : null}

      {/* Title */}
      {title && (
        <div
          style={{
            position: 'absolute',
            top: -40,
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: 28,
            fontWeight: 800,
            color: '#ffffff',
            textShadow: '0 2px 10px rgba(0, 0, 0, 0.6)',
            opacity: fadeIn(frame, startFrame, 20),
          }}
        >
          {title}
        </div>
      )}

      {/* Items */}
      {items.map((item, index) => {
        const appearFrame = startFrame + index * 10;
        const opacity = fadeIn(frame, appearFrame, 20);
        const scale = pop(frame, appearFrame);

        const posX = centerX + (item.position?.x ?? 0);
        const posY = centerY + (item.position?.y ?? 0);

        return (
          <React.Fragment key={`item-${index}`}>
            {/* Item container */}
            <div
              style={{
                position: 'absolute',
                left: posX,
                top: posY,
                transform: `translate(-50%, -50%) scale(${scale})`,
                opacity,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                willChange: 'transform, opacity',
              }}
            >
              {/* Icon */}
              <div
                style={{
                  width: 60,
                  height: 60,
                  background: 'rgba(255, 255, 255, 0.15)',
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                }}
              >
                {item.image ? (
                  <Img
                    src={item.image}
                    style={{ width: 52, height: 52, objectFit: 'contain' }}
                  />
                ) : (
                  <svg width={40} height={40} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                    {ICON_PATHS[item.icon] ?? ICON_PATHS.book}
                  </svg>
                )}
              </div>

              {/* Label */}
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#eef2ff',
                  textAlign: 'center',
                  textShadow: '0 2px 8px rgba(0, 0, 0, 0.6)',
                }}
              >
                {item.label}
              </div>

              {/* Description */}
              {item.description && (
                <div
                  style={{
                    fontSize: 14,
                    color: 'rgba(255, 255, 255, 0.6)',
                    textAlign: 'center',
                    maxWidth: 150,
                  }}
                >
                  {item.description}
                </div>
              )}
            </div>

            {/* Connections */}
            {item.connections?.map((connIndex) => {
              if (connIndex >= items.length) return null;
              const connItem = items[connIndex];
              if (!connItem) return null;
              const connX = centerX + (connItem.position?.x ?? 0);
              const connY = centerY + (connItem.position?.y ?? 0);

              const connectionOpacity = fadeIn(frame, appearFrame + 15, 20);

              return (
                <svg
                  key={`conn-${index}-${connIndex}`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    opacity: connectionOpacity,
                  }}
                >
                  <defs>
                    <marker
                      id={`arrow-${index}-${connIndex}`}
                      viewBox="0 0 10 10"
                      refX="10"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path
                        d="M0 0 L10 5 L0 10 Z"
                        fill="#8f7be0"
                      />
                    </marker>
                  </defs>
                  <line
                    x1={posX}
                    y1={posY}
                    x2={connX}
                    y2={connY}
                    stroke="#8f7be0"
                    strokeWidth="3"
                    strokeDasharray="8,4"
                    markerEnd={`url(#arrow-${index}-${connIndex})`}
                  />
                </svg>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}
