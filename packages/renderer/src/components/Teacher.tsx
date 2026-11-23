import React from 'react';
import { useCurrentFrame } from 'remotion';
import {
  INSTRUCTOR_IDS,
  INSTRUCTOR_PROFILES,
  resolveInstructor,
  type InstructorId,
  type InstructorProfile,
} from '@edumotion/shared';
import { fadeIn, point, wave } from '../utils/animation.js';

export type TeacherState = 'idle' | 'wave' | 'point' | 'thinking';

export interface TeacherProps {
  /** Stable presenter id saved in the storyboard (emma | james | sophie | alex). */
  appearance?: string;
  /** Fallback for older storyboards that only carry the selected voice. */
  voice?: string;
  state?: TeacherState;
  size?: number;
  top?: string;
  left?: string;
  startFrame?: number;
  flipX?: boolean;
}

function Hair({ profile }: { profile: InstructorProfile }): React.ReactElement {
  if (profile.hairStyle === 'short') {
    return (
      <path
        d="M77 84 Q80 36 120 32 Q160 36 163 84 Q152 60 120 58 Q88 60 77 84 Z"
        fill={profile.hair}
      />
    );
  }

  if (profile.hairStyle === 'long') {
    return (
      <path
        d="M78 88 Q76 32 120 28 Q164 32 162 88 L164 160 Q154 150 150 96 Q140 68 120 66 Q100 68 90 96 Q86 150 76 160 Z"
        fill={profile.hair}
      />
    );
  }

  if (profile.hairStyle === 'curly') {
    return (
      <g fill={profile.hair}>
        <circle cx="86" cy="60" r="20" />
        <circle cx="106" cy="45" r="22" />
        <circle cx="130" cy="43" r="22" />
        <circle cx="152" cy="60" r="20" />
        <circle cx="160" cy="83" r="16" />
        <circle cx="80" cy="83" r="16" />
        <path d="M82 78 Q88 52 120 50 Q152 52 158 78 Q146 64 120 64 Q94 64 82 78 Z" />
      </g>
    );
  }

  return (
    <path
      d="M75 92 Q73 34 120 30 Q167 34 165 92 L158 116 Q151 88 150 72 Q137 60 120 60 Q103 60 90 72 Q89 88 82 116 Z"
      fill={profile.hair}
    />
  );
}

/**
 * A reusable animated instructor. The profile is selected from the saved
 * `appearance` id, falling back to the voice preset for older storyboards.
 */
export function Teacher({
  appearance,
  voice,
  state = 'idle',
  size = 120,
  top = '78%',
  left = '50%',
  startFrame = 0,
  flipX = false,
}: TeacherProps): React.ReactElement {
  const frame = useCurrentFrame();
  const profile = appearance && (INSTRUCTOR_IDS as readonly string[]).includes(appearance)
    ? INSTRUCTOR_PROFILES[appearance as InstructorId]
    : resolveInstructor(voice);

  const elapsed = Math.max(0, frame - startFrame);
  const opacity = fadeIn(frame, startFrame, 18);
  const bob = Math.sin(elapsed * 0.085) * 2.5;
  const headNod = Math.sin(elapsed * 0.075 + 0.7) * 1.8;
  const blink = Math.sin(elapsed * 0.09) > 0.985 ? 0.12 : 1;

  let rightArm = -4 + Math.sin(elapsed * 0.05) * 2;
  let leftArm = 4 + Math.sin(elapsed * 0.045) * 1.5;

  if (state === 'wave') {
    rightArm = -138 + wave(frame, startFrame);
  } else if (state === 'point') {
    rightArm = -48 + point(frame, startFrame, 30) * 0.8;
  } else if (state === 'thinking') {
    // Bring the left hand toward the chin while the right arm stays relaxed.
    leftArm = -148 + Math.sin(elapsed * 0.04) * 1.5;
  }

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        opacity,
        transform: `translate(-50%, -50%) scaleX(${flipX ? -1 : 1})`,
        willChange: 'opacity, transform',
      }}
      aria-hidden="true"
    >
      <svg
        width={size}
        height={size * 1.75}
        viewBox="0 0 240 420"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block', overflow: 'visible' }}
      >
        <ellipse cx="120" cy="407" rx="58" ry="9" fill="rgba(0,0,0,0.24)" />

        <g transform={`translate(0 ${bob})`}>
          {/* Legs and shoes */}
          <rect x="97" y="296" width="18" height="86" rx="9" fill={profile.trousers} />
          <rect x="125" y="296" width="18" height="86" rx="9" fill={profile.trousers} />
          <path d="M91 372 Q97 368 115 368 L115 388 Q103 392 88 386 Z" fill={profile.shoes} />
          <path d="M125 368 Q143 368 149 372 L152 386 Q137 392 125 388 Z" fill={profile.shoes} />

          {/* Blazer and shirt */}
          <path
            d="M68 160 Q120 140 172 160 L184 302 Q120 318 56 302 Z"
            fill={profile.blazer}
          />
          <path d="M96 158 L120 188 L144 158 L136 300 L104 300 Z" fill={profile.shirt} />
          <path d="M68 160 L120 188 L108 218 L54 178 Z" fill={profile.blazerShade} />
          <path d="M172 160 L120 188 L132 218 L186 178 Z" fill={profile.blazerShade} />
          <circle cx="120" cy="232" r="5" fill={profile.accent} />

          {/* Arms */}
          <g transform={`translate(62 178) rotate(${leftArm} 0 0)`}>
            <rect x="-11" y="0" width="22" height="94" rx="11" fill={profile.blazer} />
            <circle cx="0" cy="97" r="11" fill={profile.skin} />
          </g>
          <g transform={`translate(178 178) rotate(${rightArm} 0 0)`}>
            <rect x="-11" y="0" width="22" height="94" rx="11" fill={profile.blazer} />
            <circle cx="0" cy="97" r="11" fill={profile.skin} />
            {state === 'point' ? (
              <line
                x1="0"
                y1="94"
                x2="0"
                y2="164"
                stroke={profile.accent}
                strokeWidth="5"
                strokeLinecap="round"
              />
            ) : null}
          </g>

          {/* Neck and head */}
          <rect x="109" y="128" width="22" height="34" rx="10" fill={profile.skinShade} />
          <g transform={`translate(0 ${headNod})`}>
            <circle cx="76" cy="94" r="9" fill={profile.skin} />
            <circle cx="164" cy="94" r="9" fill={profile.skin} />
            <ellipse cx="120" cy="92" rx="44" ry="50" fill={profile.skin} />
            <Hair profile={profile} />

            {/* Eyes */}
            <ellipse cx="103" cy="95" rx="7" ry={7 * blink} fill="#FFFFFF" />
            <ellipse cx="137" cy="95" rx="7" ry={7 * blink} fill="#FFFFFF" />
            <circle cx="104" cy="96" r="3.4" fill="#1A1A2E" />
            <circle cx="138" cy="96" r="3.4" fill="#1A1A2E" />
            <path
              d="M96 84 Q103 80 110 84 M130 84 Q137 80 144 84"
              stroke={profile.hair}
              strokeWidth="2.4"
              strokeLinecap="round"
              fill="none"
            />

            {profile.glasses ? (
              <g fill="none" stroke="#24324A" strokeWidth="2.5">
                <rect x="88" y="84" width="30" height="24" rx="9" />
                <rect x="122" y="84" width="30" height="24" rx="9" />
                <line x1="118" y1="94" x2="122" y2="94" />
                <line x1="88" y1="93" x2="76" y2="91" />
                <line x1="152" y1="93" x2="164" y2="91" />
              </g>
            ) : null}

            <path
              d="M120 102 Q116 109 121 110"
              stroke={profile.skinShade}
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M105 116 Q120 126 135 116"
              stroke="#8A3A3A"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
          </g>
        </g>
      </svg>
    </div>
  );
}
