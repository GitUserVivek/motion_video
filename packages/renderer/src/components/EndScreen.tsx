import React from 'react';
import { useCurrentFrame } from 'remotion';
import { fadeIn, bounce } from '../utils/animation.js';

export interface EndScreenProps {
  title?: string;
  /** Legacy model-authored alias for title. */
  text?: string;
  subtitle?: string;
  primaryColor?: string;
  accentColor?: string;
  showConfetti?: boolean;
  startFrame?: number;
  logoText?: string;
}

export function EndScreen({
  title,
  text,
  subtitle = 'Subscribe for more educational videos',
  primaryColor = '#4A90D9',
  accentColor = '#FFD700',
  startFrame = 0,
  logoText = 'EduMotion',
}: EndScreenProps): React.ReactElement {
  const frame = useCurrentFrame();
  const displayTitle = title?.trim() || text?.trim() || 'Thanks for Watching!';
  const titleOpacity = fadeIn(frame, startFrame, 20);
  const subtitleOpacity = fadeIn(frame, startFrame + 20, 20);
  const logoScale = bounce(frame, startFrame, 30);

  return (
    <>
      {/* Logo */}
      <div
        style={{
          position: 'absolute',
          top: '20%',
          left: '50%',
          transform: `translate(-50%, -50%) scale(${logoScale})`,
          fontSize: 80,
          fontWeight: 900,
          color: primaryColor,
          fontFamily: '\'Segoe UI\', system-ui, sans-serif',
          textShadow: `0 0 40px ${primaryColor}80`,
          opacity: titleOpacity,
          userSelect: 'none',
        }}
      >
        {logoText}
      </div>

      {/* Title */}
      <div
        style={{
          position: 'absolute',
          top: '45%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '80%',
          textAlign: 'center',
          fontSize: 72,
          fontWeight: 800,
          color: '#ffffff',
          fontFamily: '\'Segoe UI\', system-ui, sans-serif',
          lineHeight: 1.2,
          opacity: titleOpacity,
        }}
      >
        {displayTitle}
      </div>

      {/* Subtitle */}
      <div
        style={{
          position: 'absolute',
          top: '65%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '75%',
          textAlign: 'center',
          fontSize: 44,
          fontWeight: 400,
          color: accentColor,
          fontFamily: '\'Segoe UI\', system-ui, sans-serif',
          opacity: subtitleOpacity,
        }}
      >
        {subtitle}
      </div>

      {/* Decorative line */}
      <div
        style={{
          position: 'absolute',
          top: '62%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: `${Math.min(100, (frame - startFrame) * 3)}%`,
          maxWidth: '60%',
          height: '3px',
          backgroundColor: accentColor,
          opacity: titleOpacity,
        }}
      />
    </>
  );
}
