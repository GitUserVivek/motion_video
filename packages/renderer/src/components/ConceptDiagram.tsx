import React from 'react';
import { useCurrentFrame, Img } from 'remotion';
import { ICON_PATHS, type ObjectType } from '../utils/icons.js';
import { fadeIn, pop } from '../utils/animation.js';

export interface ConceptDiagramItem {
  icon: ObjectType;
  label: string;
  /** Optional artwork (data URL from resources/), drawn instead of the glyph. */
  image?: string;
}

export interface ConceptDiagramProps {
  /** Two to five labelled concepts, each drawn as its own SVG. */
  items?: ConceptDiagramItem[];
  /** Optional heading above the diagram. */
  title?: string;
  top?: string;
  left?: string;
  iconSize?: number;
  accent?: string;
  layout?: 'row' | 'grid';
  startFrame?: number;
}

const MAX_ITEMS = 5;
const TILE_WIDTH_PADDING = 26;

function Tile({
  icon,
  label,
  image,
  size,
  accent,
  appearAt,
  index,
}: {
  icon: ObjectType;
  label: string;
  image?: string;
  size: number;
  accent: string;
  appearAt: number;
  index: number;
}): React.ReactElement {
  const frame = useCurrentFrame();
  const appear = fadeIn(frame, appearAt, 12);
  const scale = pop(frame, appearAt);
  const elapsed = Math.max(0, frame - appearAt);
  // Each tile drifts on its own phase so the diagram never freezes.
  const floatY = Math.sin(elapsed * 0.06 + index * 0.9) * size * 0.03;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: size + TILE_WIDTH_PADDING,
        opacity: appear,
        transform: `translateY(${floatY}px) scale(${scale})`,
        willChange: 'opacity, transform',
      }}
    >
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <rect
            x="1.5"
            y="1.5"
            width="97"
            height="97"
            rx="20"
            fill="rgba(255,255,255,0.09)"
            stroke={accent}
            strokeOpacity="0.55"
            strokeWidth="1.6"
          />
          {image ? null : (
            <g transform="translate(14, 14) scale(0.72)">{ICON_PATHS[icon] ?? ICON_PATHS.book}</g>
          )}
        </svg>
        {/* Artwork from resources/ replaces the glyph but keeps the card frame. */}
        {image ? (
          <Img
            src={image}
            style={{
              position: 'absolute',
              top: size * 0.12,
              left: size * 0.12,
              width: size * 0.76,
              height: size * 0.76,
              objectFit: 'contain',
            }}
          />
        ) : null}
      </div>
      <div
        style={{
          marginTop: 10,
          // Constrain the label to its own tile so long words cannot spill over
          // the neighbouring label.
          width: size + TILE_WIDTH_PADDING,
          fontSize: Math.max(15, Math.round(size * 0.13)),
          fontWeight: 700,
          color: '#eef2ff',
          textAlign: 'center',
          lineHeight: 1.2,
          overflowWrap: 'anywhere',
          textShadow: '0 2px 10px rgba(0,0,0,0.6)',
        }}
      >
        {label}
      </div>
    </div>
  );
}

/** Arrow drawn as its own SVG, revealing left-to-right between two tiles. */
function Connector({
  accent,
  size,
  appearAt,
}: {
  accent: string;
  size: number;
  appearAt: number;
}): React.ReactElement {
  const frame = useCurrentFrame();
  const draw = fadeIn(frame, appearAt, 10);

  return (
    <svg
      width={32}
      height={32}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      style={{ marginTop: Math.round(size * 0.34), opacity: draw }}
    >
      <path
        d="M4 16 H26"
        stroke={accent}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="22"
        strokeDashoffset={22 * (1 - draw)}
      />
      <path
        d="M18 8 L27 16 L18 24"
        stroke={accent}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * A self-contained concept diagram: several SVG illustrations joined by arrows,
 * each with its own label, plus an optional heading. The backend builds the item
 * list deterministically from the narration, so every scene ends up with real
 * artwork and readable text instead of a lone icon.
 */
export function ConceptDiagram({
  items = [],
  title = '',
  top = '58%',
  left = '50%',
  iconSize = 140,
  accent = '#8f7be0',
  layout = 'row',
  startFrame = 0,
}: ConceptDiagramProps): React.ReactElement {
  const list = items
    .filter((item) => item && typeof item.icon === 'string' && typeof item.label === 'string')
    .filter((item) => item.label.trim().length > 0)
    .slice(0, MAX_ITEMS);

  if (list.length === 0) return <></> as React.ReactElement;

  const isGrid = layout === 'grid' && list.length > 2;
  const heading = title.trim();

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        transform: 'translate(-50%, -50%)',
        width: '92%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {heading ? (
        <div
          style={{
            marginBottom: 14,
            fontSize: 34,
            fontWeight: 800,
            letterSpacing: 0.4,
            color: '#ffffff',
            textAlign: 'center',
            textShadow: '0 3px 14px rgba(0,0,0,0.55)',
          }}
        >
          {heading}
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: isGrid ? 'wrap' : 'nowrap',
          justifyContent: 'center',
          alignItems: 'flex-start',
          columnGap: 18,
          rowGap: 14,
          maxWidth: isGrid ? iconSize * 2.9 : undefined,
        }}
      >
        {list.map((item, i) => (
          <React.Fragment key={`${item.icon}-${i}`}>
            {i > 0 && !isGrid ? (
              <Connector
                accent={accent}
                size={iconSize}
                appearAt={startFrame + i * 7 - 2}
              />
            ) : null}
            <Tile
              icon={item.icon}
              label={item.label}
              image={item.image}
              size={iconSize}
              accent={accent}
              appearAt={startFrame + i * 7}
              index={i}
            />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
