import React from 'react';
import { STEP_LABELS } from '@edumotion/shared';

interface ProgressTrackerProps {
  progress: number;
  currentStep: string;
  status: string;
  error?: string | null;
}

export function ProgressTracker({
  progress,
  currentStep,
  status,
  error,
}: ProgressTrackerProps): React.ReactElement {
  const pct = Math.round(progress);
  const label = STEP_LABELS[currentStep] ?? currentStep;
  const isError = status === 'failed';
  const isDone = status === 'completed';

  const barColor = isError ? '#e74c3c' : isDone ? '#2ecc71' : '#4A90D9';

  return (
    <div style={{ padding: '24px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 14, color: '#a0a0c0' }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: barColor }}>{pct}%</span>
      </div>
      <div style={{
        width: '100%', height: 10,
        backgroundColor: '#2a2a4a',
        borderRadius: 10,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          backgroundColor: barColor,
          borderRadius: 10,
          transition: 'width 0.5s ease',
          boxShadow: `0 0 12px ${barColor}80`,
        }} />
      </div>
      {isError && error && (
        <div style={{
          marginTop: 12, padding: '12px 16px',
          backgroundColor: '#e74c3c20',
          border: '1px solid #e74c3c',
          borderRadius: 8,
          color: '#e74c3c',
          fontSize: 13,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
