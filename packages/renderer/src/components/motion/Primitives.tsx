import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  accentAt,
  BORDER,
  CARD_RADIUS,
  CARD_SHADOW,
  CARD_SHADOW_SM,
  FONTS,
  INK,
  PAPER,
  springIn,
  STICKER_SHADOW,
} from '../../utils/design.js';
import { type PaletteId, paletteStyle } from '../../utils/palette.js';

export interface StickerProps {
  children: React.ReactNode;
  color?: string;
  rotate?: number;
  fontSize?: number;
  padding?: string;
  style?: React.CSSProperties;
}

/** A solid label with the system's hard outline and offset shadow. */
export function Sticker({
  children,
  color = accentAt(0),
  rotate = -2,
  fontSize = 26,
  padding = '10px 22px',
  style,
}: StickerProps): React.ReactElement {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: color,
        border: BORDER,
        borderRadius: 10,
        boxShadow: STICKER_SHADOW,
        color: INK,
        fontFamily: FONTS.display,
        fontSize,
        fontWeight: 900,
        letterSpacing: 1.2,
        lineHeight: 1,
        padding,
        textTransform: 'uppercase',
        transform: `rotate(${rotate}deg)`,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export interface SectionTagProps {
  label: string;
  color?: string;
  top?: string;
  left?: string;
  right?: string;
  rotate?: number;
  startFrame?: number;
  fontSize?: number;
  style?: React.CSSProperties;
}

/** A scene's chapter label, floating above the headline. */
export function SectionTag({
  label,
  color = accentAt(1),
  top = '8%',
  left = '50%',
  right,
  rotate = -2,
  startFrame = 0,
  fontSize = 26,
  style,
}: SectionTagProps): React.ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const appear = springIn(frame, fps, startFrame, { damping: 16, stiffness: 140 });
  const offset = (1 - appear) * 22;

  return (
    <div
      style={{
        position: 'absolute',
        top,
        ...(right ? { right } : { left }),
        transform: `translateX(${right ? 0 : -50}%) translateY(${offset}px) rotate(${rotate}deg) scale(${0.86 + appear * 0.14})`,
        opacity: appear,
        zIndex: 30,
        ...style,
      }}
    >
      <Sticker color={color} rotate={0} fontSize={fontSize}>
        {label}
      </Sticker>
    </div>
  );
}

export interface PaperCardProps {
  children: React.ReactNode;
  background?: string;
  style?: React.CSSProperties;
}

/** The workhorse white card used by diagrams, comparisons and recaps. */
export function PaperCard({
  children,
  background = PAPER,
  style,
}: PaperCardProps): React.ReactElement {
  return (
    <div
      style={{
        background,
        border: BORDER,
        borderRadius: CARD_RADIUS,
        boxShadow: CARD_SHADOW,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export interface CodePanelProps {
  lines: string[];
  title?: string;
  accent?: string;
  fontSize?: number;
  /** Line numbers help code, but read as noise in front of a formula. */
  showLineNumbers?: boolean;
  style?: React.CSSProperties;
}

/** A dark terminal panel; the only place white body type is allowed. */
export function CodePanel({
  lines,
  title,
  accent = accentAt(2),
  fontSize = 28,
  showLineNumbers = true,
  style,
}: CodePanelProps): React.ReactElement {
  return (
    <div
      style={{
        background: '#111111',
        border: BORDER,
        borderRadius: 16,
        boxShadow: `10px 10px 0 ${accent}`,
        color: PAPER,
        fontFamily: FONTS.mono,
        padding: '26px 30px',
        ...style,
      }}
    >
      {title ? (
        <div
          style={{
            color: accent,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: 1.6,
            marginBottom: 16,
            textTransform: 'uppercase',
          }}
        >
          {title}
        </div>
      ) : null}
      {lines.map((line, index) => (
        <div
          key={`${line}-${index}`}
          style={{
            fontSize,
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
          }}
        >
          {showLineNumbers ? (
            <span style={{ color: accent, marginRight: 14 }}>{String(index + 1).padStart(2, '0')}</span>
          ) : null}
          {line}
        </div>
      ))}
    </div>
  );
}

export interface FrameMeterScene {
  accent: string;
  frames: number;
}

export interface FrameMeterProps {
  scenes: FrameMeterScene[];
  totalFrames: number;
}

function timecode(frame: number, fps: number): string {
  const totalSeconds = frame / fps;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const hundredths = Math.floor((totalSeconds % 1) * 100);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

/** The thin editorial timeline that stays fixed across every scene. */
export function FrameMeter({ scenes, totalFrames }: FrameMeterProps): React.ReactElement {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const progress = totalFrames > 0 ? Math.min(1, Math.max(0, frame / totalFrames)) : 0;
  const safeScenes = scenes.length > 0 ? scenes : [{ accent: accentAt(0), frames: totalFrames }];
  const sceneTotal = safeScenes.reduce((sum, scene) => sum + Math.max(1, scene.frames), 0);

  let elapsed = 0;
  let active = 0;
  for (let index = 0; index < safeScenes.length; index += 1) {
    const scene = safeScenes[index];
    elapsed += Math.max(1, scene?.frames ?? 1);
    if (frame <= (elapsed / sceneTotal) * totalFrames) {
      active = index;
      break;
    }
    active = index;
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: '4%',
        right: '4%',
        bottom: 34,
        zIndex: 120,
        color: INK,
        fontFamily: FONTS.mono,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontSize: 19,
          fontWeight: 700,
          letterSpacing: 0.8,
          marginBottom: 7,
          textTransform: 'uppercase',
        }}
      >
        <span>Anupam Classes / Field Notes</span>
        <span>
          {timecode(frame, fps)} · {width} × {height} · {fps} FPS
        </span>
      </div>

      <div
        style={{
          position: 'relative',
          display: 'flex',
          height: 28,
          background: PAPER,
          border: BORDER,
          borderRadius: 9,
          boxShadow: '4px 4px 0 #111111',
          overflow: 'visible',
        }}
      >
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', borderRadius: 5 }}>
          {safeScenes.map((scene, index) => (
            <div
              key={`scene-${index}`}
              style={{
                flex: `${Math.max(1, scene.frames)} 1 0`,
                background: scene.accent,
                borderRight: index === safeScenes.length - 1 ? 'none' : '3px solid #111111',
                opacity: index === active ? 1 : 0.58,
              }}
            />
          ))}
        </div>

        <div
          style={{
            position: 'absolute',
            left: `calc(${progress * 100}% - 2px)`,
            top: -9,
            bottom: -9,
            width: 4,
            background: '#FF5A1F',
            border: '2px solid #111111',
            borderRadius: 2,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: `calc(${progress * 100}% - 8px)`,
            top: -16,
            width: 16,
            height: 16,
            background: '#FF5A1F',
            border: '3px solid #111111',
            transform: 'rotate(45deg)',
          }}
        />
      </div>
    </div>
  );
}

export interface SceneWipeProps {
  startFrame: number;
  color: string;
  accent?: string;
}

/** A designed paper wipe that covers the hard cut between scenes. */
export function SceneWipe({
  startFrame,
  color,
  accent = accentAt(1),
}: SceneWipeProps): React.ReactElement | null {
  const frame = useCurrentFrame();
  if (frame < startFrame || frame > startFrame + 17) return null;

  const p1 = interpolate(frame, [startFrame, startFrame + 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const p2 = interpolate(frame, [startFrame + 2, startFrame + 16], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ zIndex: 90, pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: color,
          borderBottom: '10px solid #111111',
          transform: `translateY(${-p1 * 100}%)`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '24%',
            background: accent,
            borderTop: '6px solid #111111',
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: '10%',
          background: accentAt(2),
          borderBottom: '5px solid #111111',
          transform: `translateY(${-p2 * 100}%)`,
        }}
      />
    </AbsoluteFill>
  );
}

export interface ShapeClusterProps {
  palette?: PaletteId;
  dark?: boolean;
  seed?: number;
}

/**
 * Three oversized, outlined paper shapes tucked into the frame corners. They
 * make the background feel composed without putting a glow behind the text.
 */
export function ShapeCluster({
  palette = 'sky',
  dark = false,
  seed = 0,
}: ShapeClusterProps): React.ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const colors = paletteStyle(palette);
  const shapes: Array<{
    left?: number | string;
    right?: number;
    top?: string;
    bottom?: string;
    size: number;
    color: string;
    rotate: number;
    kind: 'square' | 'circle' | 'diamond';
  }> = [
    {
      left: -54,
      top: '17%',
      size: 180,
      color: colors.accent,
      rotate: 12 + seed * 3,
      kind: 'square' as const,
    },
    {
      right: -42,
      top: '8%',
      size: 138,
      color: accentAt(1 + seed),
      rotate: -14,
      kind: 'circle' as const,
    },
    {
      left: '6%',
      bottom: '16%',
      size: 122,
      color: accentAt(2 + seed),
      rotate: 8,
      kind: 'diamond' as const,
    },
  ];

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {shapes.map((shape, index) => {
        const appear = springIn(frame, fps, index * 4, { damping: 15, stiffness: 90 });
        const drift = Math.sin(frame / 70 + index) * 4;
        return (
          <div
            key={`shape-${index}`}
            style={{
              position: 'absolute',
              left: shape.left,
              right: shape.right,
              top: shape.top,
              bottom: shape.bottom,
              width: shape.size,
              height: shape.size,
              background: shape.color,
              border: '5px solid #111111',
              borderRadius: shape.kind === 'circle' ? '50%' : shape.kind === 'diamond' ? 8 : 14,
              boxShadow: CARD_SHADOW_SM,
              opacity: (dark ? 0.9 : 0.82) * appear,
              transform: `translateY(${(1 - appear) * 48}px) rotate(${shape.rotate + drift}deg)`,
            }}
          />
        );
      })}
    </div>
  );
}
