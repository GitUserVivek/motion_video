import React from 'react';
import { STEP_LABELS } from '@edumotion/shared';

interface ProgressTrackerProps {
  progress: number;
  currentStep: string;
  status: string;
  error?: string | null;
  /** Scene render progress, reported by the backend while rendering. */
  scenesCompleted?: number;
  scenesTotal?: number;
}

export function ProgressTracker({
  progress,
  currentStep,
  status,
  error,
  scenesCompleted,
  scenesTotal,
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
      {typeof scenesTotal === 'number' && scenesTotal > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 12, color: '#a0a0c0' }}>
              {isDone ? 'Scenes rendered' : 'Rendering scenes'}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#8f7be0' }}>
              {scenesCompleted ?? 0} / {scenesTotal}
            </span>
          </div>
          <div style={{
            width: '100%', height: 6,
            backgroundColor: '#2a2a4a',
            borderRadius: 6,
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${Math.round(Math.min(1, (scenesCompleted ?? 0) / scenesTotal) * 100)}%`,
              height: '100%',
              backgroundColor: '#8f7be0',
              borderRadius: 6,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      )}

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
