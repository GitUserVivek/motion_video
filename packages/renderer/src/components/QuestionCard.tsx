import React from 'react';
import { useCurrentFrame } from 'remotion';
import { fadeIn, bounce } from '../utils/animation.js';

export interface QuestionCardProps {
  question: string;
  options?: string[];
  revealAnswer?: boolean;
  answer?: string;
  startFrame?: number;
  accentColor?: string;
  top?: string;
  width?: string;
}

export function QuestionCard({
  question,
  options = [],
  revealAnswer = false,
  answer = '',
  startFrame = 0,
  accentColor = '#4A90D9',
  top = '25%',
  width = '80%',
}: QuestionCardProps): React.ReactElement {
  const frame = useCurrentFrame();
  const opacity = fadeIn(frame, startFrame, 20);
  const scale = bounce(frame, startFrame, 20);

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: '50%',
        transform: `translateX(-50%) scale(${scale})`,
        width,
        opacity,
        backgroundColor: 'rgba(255,255,255,0.1)',
        backdropFilter: 'blur(10px)',
        borderRadius: '20px',
        border: `2px solid ${accentColor}`,
        padding: '40px',
        boxShadow: `0 20px 60px rgba(0,0,0,0.3)`,
      }}
    >
      <div
        style={{
          fontSize: 48,
          fontWeight: 700,
          color: '#ffffff',
          fontFamily: '\'Segoe UI\', system-ui, sans-serif',
          textAlign: 'center',
          marginBottom: '30px',
          lineHeight: 1.3,
        }}
      >
        {question}
      </div>
      {options.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {options.map((opt, i) => (
            <div
              key={i}
              style={{
                backgroundColor: revealAnswer && opt === answer
                  ? '#2ECC71'
                  : 'rgba(255,255,255,0.15)',
                borderRadius: '12px',
                padding: '20px 30px',
                fontSize: 40,
                color: '#ffffff',
                fontFamily: '\'Segoe UI\', system-ui, sans-serif',
                fontWeight: 600,
                border: `1px solid ${revealAnswer && opt === answer ? '#2ECC71' : 'rgba(255,255,255,0.3)'}`,
              }}
            >
              {String.fromCharCode(65 + i)}. {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
