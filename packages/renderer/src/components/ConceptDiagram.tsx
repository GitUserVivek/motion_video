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
import { Sticker } from './motion/Primitives.js';

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

function Connector({ appearAt }: { appearAt: number }): React.ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const draw = springIn(frame, fps, appearAt, { damping: 18, stiffness: 130 });

  return (
    <svg
      width={36}
      height={36}
      viewBox="0 0 36 36"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, opacity: draw, marginTop: 54 }}
    >
      <path
        d="M3 18 H31"
        stroke={INK}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="30"
        strokeDashoffset={30 * (1 - draw)}
      />
      <path
        d="M23 9 L32 18 L23 27"
        stroke={INK}
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * A row or grid of sticker cards. The old version floated tiny translucent
 * tiles over a gradient; this version treats each concept as a physical card
 * with a heavy outline, a hard shadow and a readable label.
 */
export function ConceptDiagram({
  items = [],
  title = '',
  top = '58%',
  left = '50%',
  iconSize = 140,
  layout = 'row',
  startFrame = 0,
}: ConceptDiagramProps): React.ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const list = items
    .filter((item) => item && typeof item.icon === 'string' && typeof item.label === 'string')
    .filter((item) => item.label.trim().length > 0)
    .slice(0, MAX_ITEMS);

  if (list.length === 0) return <></> as React.ReactElement;

  const isGrid = (layout === 'grid' && list.length > 2) || list.length > 3;
  const heading = title.trim();
  const cardWidth = Math.max(156, Math.min(236, iconSize + 36));
  const icon = Math.max(76, Math.min(148, iconSize - 22));

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
        <div style={{ marginBottom: 24, transform: 'rotate(-2deg)' }}>
          <Sticker color={accentAt(1)} rotate={0} fontSize={24} padding="9px 20px">
            {heading}
          </Sticker>
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: isGrid ? 'wrap' : 'nowrap',
          justifyContent: 'center',
          alignItems: 'center',
          columnGap: isGrid ? 24 : 12,
          rowGap: 24,
          maxWidth: isGrid ? cardWidth * 2 + 60 : undefined,
        }}
      >
        {list.map((item, index) => {
          const appear = springIn(frame, fps, startFrame + index * 7, {
            damping: 16,
            stiffness: 140,
          });

          return (
            <React.Fragment key={`${item.icon}-${index}`}>
              {index > 0 && !isGrid ? <Connector appearAt={startFrame + index * 7 - 2} /> : null}
              <div
                style={{
                  width: cardWidth,
                  minHeight: cardWidth + 62,
                  background: accentAt(index),
                  border: BORDER,
                  borderRadius: 20,
                  boxShadow: CARD_SHADOW,
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  opacity: Math.min(1, Math.max(0, appear)),
                  transform: `translateY(${(1 - appear) * 30}px) rotate(${(index % 2 === 0 ? -1 : 1) * 1.2}deg)`,
                  willChange: 'transform, opacity',
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    width: icon + 18,
                    height: icon + 18,
                    background: PAPER,
                    border: BORDER,
                    borderRadius: 14,
                    boxShadow: CARD_SHADOW_SM,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: -12,
                      left: -12,
                      background: PAPER,
                      border: BORDER_THIN,
                      borderRadius: 7,
                      boxShadow: '3px 3px 0 #111111',
                      color: INK,
                      fontFamily: FONTS.mono,
                      fontSize: 14,
                      fontWeight: 700,
                      lineHeight: 1,
                      padding: '3px 6px',
                    }}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  {item.image ? (
                    <Img
                      src={item.image}
                      style={{
                        width: icon,
                        height: icon,
                        objectFit: 'contain',
                      }}
                    />
                  ) : (
                    <svg
                      width={icon}
                      height={icon}
                      viewBox="0 0 100 100"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      {ICON_PATHS[item.icon] ?? ICON_PATHS.book}
                    </svg>
                  )}
                </div>

                <div
                  style={{
                    marginTop: 12,
                    width: '100%',
                    color: INK,
                    fontFamily: FONTS.display,
                    fontSize: fitFontSize(item.label, cardWidth - 22, 25, 25, 14),
                    fontWeight: 900,
                    letterSpacing: -0.6,
                    lineHeight: 0.98,
                    textAlign: 'center',
                    textTransform: 'uppercase',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {item.label}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
