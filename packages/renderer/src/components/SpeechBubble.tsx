import React from 'react';
import { Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { easeOut, fadeIn } from '../utils/animation.js';

/**
 * A spoken line in a designed bubble, instead of another paragraph of text.
 *
 * The storyboard model writes narration; this component lets the director show
 * a hook question or a quoted thought as an element the viewer recognises, with
 * a tail pointing at whatever is speaking. It floats gently so it is never a
 * static card.
 */

export interface SpeechBubbleProps {
  text: string;
  /** Caption-specific artwork inlined as a data URL. */
  image?: string;
  /** Small pill above the bubble, e.g. "Narrator" or a character name. */
  speaker?: string;
  tail?: 'left' | 'right' | 'none';
  variant?: 'statement' | 'question' | 'thought';
  top?: string;
  left?: string;
  width?: number;
  fontSize?: number;
  accent?: string;
  startFrame?: number;
}

/** Only a plain six-digit hex accent can be used in rgba-style concatenation. */
function safeInk(accent: string): string {
  return /^#[0-9a-f]{6}$/i.test(accent) ? accent : '#FFD166';
}

export function SpeechBubble({
  text,
  image,
  speaker,
  tail = 'left',
  variant = 'statement',
  top = '62%',
  left = '50%',
  width = 820,
  fontSize = 36,
  accent = '#FFD166',
  startFrame = 0,
}: SpeechBubbleProps): React.ReactElement {
  const frame = useCurrentFrame();
  const { width: frameWidth } = useVideoConfig();

  const ink = safeInk(accent);
  const appear = fadeIn(frame, startFrame, 16);
  const scale = interpolate(frame, [startFrame, startFrame + 22], [0.92, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOut,
  });
  const rise = interpolate(frame, [startFrame, startFrame + 24], [28, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOut,
  });
  const float = Math.sin(Math.max(0, frame - startFrame) * 0.05) * 5;
  const bubbleWidth = Math.min(width, Math.round(frameWidth * 0.88));

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        width: bubbleWidth,
        transform: 'translate(-50%, -50%)',
        opacity: appear,
        willChange: 'opacity, transform',
      }}
    >
      {/* Tail sits behind the bubble so only its outer half shows. */}
      {variant === 'thought' ? (
        <>
          <div
            style={{
              position: 'absolute',
              bottom: -16,
              left: '50%',
              width: 20,
              height: 20,
              marginLeft: -10,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.96)',
              border: `2px solid ${ink}`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: -40,
              left: '50%',
              width: 12,
              height: 12,
              marginLeft: -24,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.96)',
              border: `2px solid ${ink}`,
            }}
          />
        </>
      ) : tail !== 'none' ? (
        <div
          style={{
            position: 'absolute',
            bottom: -13,
            ...(tail === 'left' ? { left: 64 } : { right: 64 }),
            width: 26,
            height: 26,
            borderRadius: 4,
            background: 'rgba(255,255,255,0.96)',
            borderRight: `3px solid ${ink}`,
            borderBottom: `3px solid ${ink}`,
            transform: 'rotate(45deg)',
          }}
        />
      ) : null}

      <div
        style={{
          position: 'relative',
          padding: '30px 34px',
          borderRadius: 30,
          background: 'rgba(255,255,255,0.96)',
          border: `3px solid ${ink}`,
          boxShadow: '0 22px 60px rgba(4,10,26,0.42)',
          transform: `translateY(${rise + float}px) scale(${scale})`,
          willChange: 'transform',
        }}
      >
        {speaker ? (
          <div
            style={{
              position: 'absolute',
              top: -17,
              left: 30,
              padding: '4px 16px',
              borderRadius: 999,
              background: ink,
              color: '#101a30',
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
            }}
          >
            {speaker}
          </div>
        ) : null}

        {image ? (
          <Img
            src={image}
            style={{
              display: 'block',
              width: 96,
              height: 96,
              objectFit: 'contain',
              margin: '0 auto 14px',
            }}
          />
        ) : null}

        <div
          style={{
            fontSize,
            fontWeight: 700,
            lineHeight: 1.3,
            color: '#14233d',
            textAlign: 'left',
          }}
        >
          {text}
        </div>

        {variant === 'question' ? (
          <div
            style={{
              position: 'absolute',
              top: -26,
              right: -18,
              width: 58,
              height: 58,
              borderRadius: '50%',
              background: ink,
              color: '#101a30',
              fontSize: 36,
              fontWeight: 900,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 10px 26px rgba(4,10,26,0.35)',
            }}
          >
            ?
          </div>
        ) : null}
      </div>
    </div>
  );
}
