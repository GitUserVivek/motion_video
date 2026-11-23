import React from 'react';
import { Img, useCurrentFrame } from 'remotion';
import { fadeIn, pop } from '../utils/animation.js';
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
  /**
   * `auto` arranges the items in a centered row/grid and ignores raw model
   * offsets (which were often page coordinates, not offsets). `manual` keeps the
   * old offset behaviour for storyboards that deliberately placed their items.
   */
  layout?: 'auto' | 'manual';
}

interface PlacedItem {
  x: number;
  y: number;
  cellWidth: number;
  tile: number;
  labelFont: number;
}

/**
 * Grid geometry for the auto layout. The panel grows with the number of items,
 * so three tiles are not squeezed into the corner of a fixed 600×400 box.
 */
function autoLayout(
  count: number,
  panelWidth: number,
): { placements: PlacedItem[]; height: number; tile: number } {
  const columns = count <= 3 ? Math.max(1, count) : count === 4 ? 2 : 3;
  const rows = Math.max(1, Math.ceil(count / columns));
  const padding = 26;
  const cellWidth = (panelWidth - padding * 2) / columns;
  const cellHeight = Math.max(126, Math.min(cellWidth + 42, 196));
  const tile = Math.max(44, Math.min(104, Math.floor(Math.min(cellWidth - 14, 104))));
  const labelFont = Math.max(15, Math.min(22, Math.round(tile * 0.2)));

  const placements: PlacedItem[] = Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const itemsInRow = Math.min(columns, count - row * columns);
    const offset = (columns - itemsInRow) / 2;
    const x = Math.min(
      panelWidth - tile / 2 - 10,
      Math.max(tile / 2 + 10, padding + cellWidth * (offset + column + 0.5)),
    );
    const y = padding + cellHeight * (row + 0.5);
    return { x, y, cellWidth, tile, labelFont };
  });

  return { placements, height: Math.max(200, rows * cellHeight + padding * 2), tile };
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
  layout = 'auto',
}: AnimatedDiagramProps): React.ReactElement {
  const frame = useCurrentFrame();

  const formula = equation?.trim();
  const isManual = layout === 'manual';
  const panelWidth = Math.max(300, Math.min(width, 900));
  const auto = autoLayout(items.length, panelWidth);
  const panelHeight = isManual ? height : auto.height;

  const centerX = panelWidth / 2;
  const centerY = panelHeight / 2;

  const positionOf = (index: number): { x: number; y: number } => {
    const item = items[index];
    if (isManual) {
      return {
        x: centerX + (item?.position?.x ?? 0),
        y: centerY + (item?.position?.y ?? 0),
      };
    }
    return auto.placements[index] ?? { x: centerX, y: centerY };
  };

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
            fontSize: Math.max(30, Math.min(46, Math.round(panelWidth * 0.06))),
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
            width: '100%',
            textAlign: 'center',
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

        const position = positionOf(index);
        const posX = position.x;
        const posY = position.y;
        const tile = isManual ? 60 : (auto.placements[index]?.tile ?? 60);
        const labelFont = isManual ? 18 : (auto.placements[index]?.labelFont ?? 18);
        const labelWidth = isManual ? 150 : Math.max(70, (auto.placements[index]?.cellWidth ?? 150) - 14);

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
                width: labelWidth,
                willChange: 'transform, opacity',
              }}
            >
              {/* Icon */}
              <div
                style={{
                  width: tile,
                  height: tile,
                  background: 'rgba(255, 255, 255, 0.15)',
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  flexShrink: 0,
                }}
              >
                {item.image ? (
                  <Img
                    src={item.image}
                    style={{
                      width: tile * 0.86,
                      height: tile * 0.86,
                      objectFit: 'contain',
                    }}
                  />
                ) : (
                  <svg
                    width={tile * 0.66}
                    height={tile * 0.66}
                    viewBox="0 0 100 100"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    {ICON_PATHS[item.icon] ?? ICON_PATHS.book}
                  </svg>
                )}
              </div>

              {/* Label */}
              <div
                style={{
                  // A minimum readable size and a hard width keep long labels
                  // from colliding with the neighbouring tile.
                  fontSize: labelFont,
                  fontWeight: 700,
                  color: '#eef2ff',
                  textAlign: 'center',
                  lineHeight: 1.15,
                  width: labelWidth,
                  maxHeight: labelFont * 2.6,
                  overflow: 'hidden',
                  overflowWrap: 'anywhere',
                  textShadow: '0 2px 8px rgba(0, 0, 0, 0.6)',
                }}
              >
                {item.label}
              </div>

              {/* Description */}
              {item.description && (
                <div
                  style={{
                    fontSize: Math.max(12, labelFont - 4),
                    color: 'rgba(255, 255, 255, 0.6)',
                    textAlign: 'center',
                    width: labelWidth,
                    overflow: 'hidden',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {item.description}
                </div>
              )}
            </div>

            {/* Connections */}
            {item.connections?.map((connIndex) => {
              if (connIndex >= items.length) return null;
              const connPosition = positionOf(connIndex);

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
                    x2={connPosition.x}
                    y2={connPosition.y}
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
