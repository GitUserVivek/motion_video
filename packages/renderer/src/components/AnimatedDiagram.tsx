import React from 'react';
import { Img, useCurrentFrame, useVideoConfig } from 'remotion';
import { fitFontSize } from '@edumotion/shared';
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
  STICKER_SHADOW,
} from '../utils/design.js';
import { ICON_PATHS, type ObjectType } from '../utils/icons.js';
import { CodePanel, Sticker } from './motion/Primitives.js';

export interface DiagramItem {
  icon: ObjectType;
  label: string;
  /** Caption-specific artwork inlined as a data URL. */
  image?: string;
  description?: string;
  position: { x: number; y: number };
  connections?: number[];
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
  /** Optional override for the icon square inside each card. */
  iconSize?: number;
  /**
   * `auto` arranges the items in a centered row/grid and ignores raw model
   * offsets (which were often page coordinates, not offsets). `manual` keeps the
   * old offset behaviour for storyboards that deliberately placed their items.
   */
  layout?: 'auto' | 'manual';
}

interface Placement {
  x: number;
  y: number;
  cardWidth: number;
  cardHeight: number;
  icon: number;
}

function autoLayout(
  count: number,
  panelWidth: number,
  requestedIcon?: number,
): { placements: Placement[]; height: number } {
  const safeCount = Math.max(1, count);
  const columns = safeCount <= 1 ? 1 : safeCount <= 3 ? safeCount : 2;
  const rows = Math.max(1, Math.ceil(safeCount / columns));
  const padding = 18;
  const gap = 18;
  const cardWidth = (panelWidth - padding * 2 - gap * (columns - 1)) / columns;
  const iconBase = requestedIcon
    ?? (safeCount === 1
      ? Math.min(286, cardWidth * 0.58)
      : Math.min(176, cardWidth * 0.52));
  const icon = Math.max(76, Math.floor(iconBase));
  const cardHeight = icon + (safeCount === 1 ? 152 : 112);

  const placements: Placement[] = Array.from({ length: safeCount }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const itemsInRow = Math.min(columns, safeCount - row * columns);
    const offset = (columns - itemsInRow) / 2;
    return {
      x: padding + (offset + column) * (cardWidth + gap) + cardWidth / 2,
      y: padding + row * (cardHeight + gap) + cardHeight / 2,
      cardWidth,
      cardHeight,
      icon,
    };
  });

  return {
    placements,
    height: rows * cardHeight + (rows - 1) * gap + padding * 2,
  };
}

export function AnimatedDiagram({
  items = [],
  equation,
  title,
  top = '56%',
  left = '50%',
  startFrame = 0,
  width = 760,
  height = 420,
  iconSize,
  layout = 'auto',
}: AnimatedDiagramProps): React.ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const formula = equation?.trim();
  const formulaOnly = Boolean(formula) && items.length === 0;
  const isManual = layout === 'manual';
  const panelWidth = Math.max(320, Math.min(width, 940));
  const auto = autoLayout(items.length, panelWidth, iconSize);
  const panelHeight = isManual ? height : formulaOnly ? 280 : auto.height;

  const positions: Placement[] = items.map((item, index) => {
    if (isManual) {
      return {
        x: panelWidth / 2 + (item.position?.x ?? 0),
        y: panelHeight / 2 + (item.position?.y ?? 0),
        cardWidth: 160,
        cardHeight: 190,
        icon: 90,
      };
    }
    return auto.placements[index] ?? {
      x: panelWidth / 2,
      y: panelHeight / 2,
      cardWidth: 200,
      cardHeight: 220,
      icon: 100,
    };
  });

  if (!formula && items.length === 0) return <></> as React.ReactElement;

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        transform: 'translate(-50%, -50%)',
        width: panelWidth,
        height: panelHeight,
      }}
    >
      {title ? (
        <div
          style={{
            position: 'absolute',
            top: -28,
            left: '50%',
            transform: 'translateX(-50%) rotate(-2deg)',
            zIndex: 4,
          }}
        >
          <Sticker color={accentAt(1)} rotate={0} fontSize={22} padding="8px 18px">
            {title}
          </Sticker>
        </div>
      ) : null}

      {formula ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 26,
          }}
        >
          <CodePanel
            lines={[formula]}
            accent={accentAt(2)}
            showLineNumbers={false}
            fontSize={Math.max(26, Math.min(36, Math.round(panelWidth * 0.038)))}
            style={{ width: panelWidth - 40 }}
          />
        </div>
      ) : null}

      {/* Connections sit behind the cards but above the paper. */}
      {items.map((item, index) => {
        const from = positions[index];
        if (!item.connections || !from) return null;
        return (
          <React.Fragment key={`connections-${index}`}>
            {item.connections.map((connectionIndex) => {
              const to = positions[connectionIndex];
              if (!to) return null;
              const marker = `diagram-arrow-${index}-${connectionIndex}`;
              return (
                <svg
                  key={`conn-${index}-${connectionIndex}`}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    overflow: 'visible',
                  }}
                >
                  <defs>
                    <marker
                      id={marker}
                      viewBox="0 0 10 10"
                      refX="9"
                      refY="5"
                      markerWidth="7"
                      markerHeight="7"
                      orient="auto-start-reverse"
                    >
                      <path d="M0 0 L10 5 L0 10 Z" fill={INK} />
                    </marker>
                  </defs>
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={INK}
                    strokeWidth={4}
                    strokeDasharray="9 5"
                    markerEnd={`url(#${marker})`}
                  />
                </svg>
              );
            })}
          </React.Fragment>
        );
      })}

      {items.map((item, index) => {
        const placement = positions[index];
        if (!placement) return null;
        const appear = springIn(frame, fps, startFrame + index * 7, {
          damping: 16,
          stiffness: 130,
        });
        const single = items.length === 1;
        const labelFont = single ? 46 : 25;
        const descriptionFont = single ? 23 : 17;
        const color = accentAt(index);

        return (
          <div
            key={`item-${index}`}
            style={{
              position: 'absolute',
              left: placement.x,
              top: placement.y,
              width: placement.cardWidth,
              height: placement.cardHeight,
              transform: `translate(-50%, -50%) translateY(${(1 - appear) * 34}px) rotate(${(index % 2 === 0 ? -1 : 1) * 1.2}deg)`,
              opacity: Math.min(1, Math.max(0, appear)),
              background: color,
              border: BORDER,
              borderRadius: 20,
              boxShadow: CARD_SHADOW,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
              willChange: 'transform, opacity',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 12,
                left: 14,
                background: PAPER,
                border: BORDER_THIN,
                borderRadius: 8,
                boxShadow: CARD_SHADOW_SM,
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

            <div
              style={{
                width: placement.icon,
                height: placement.icon,
                background: PAPER,
                border: BORDER,
                borderRadius: 16,
                boxShadow: CARD_SHADOW_SM,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: 10,
                marginBottom: single ? 16 : 10,
              }}
            >
              {item.image ? (
                <Img
                  src={item.image}
                  style={{
                    width: placement.icon * 0.86,
                    height: placement.icon * 0.86,
                    objectFit: 'contain',
                  }}
                />
              ) : (
                <svg
                  width={placement.icon * 0.78}
                  height={placement.icon * 0.78}
                  viewBox="0 0 100 100"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {ICON_PATHS[item.icon] ?? ICON_PATHS.book}
                </svg>
              )}
            </div>

            <div
              style={{
                width: '100%',
                color: INK,
                fontFamily: FONTS.display,
                fontSize: fitFontSize(item.label, placement.cardWidth - 34, labelFont, labelFont, 18),
                fontWeight: 900,
                letterSpacing: -1,
                lineHeight: 0.94,
                textAlign: 'center',
                textTransform: 'uppercase',
              }}
            >
              {item.label}
            </div>

            {item.description ? (
              <div
                style={{
                  width: '100%',
                  marginTop: 7,
                  color: 'rgba(17,17,17,0.72)',
                  fontFamily: FONTS.body,
                  fontSize: descriptionFont,
                  fontWeight: 700,
                  lineHeight: 1.2,
                  textAlign: 'center',
                }}
              >
                {item.description}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
