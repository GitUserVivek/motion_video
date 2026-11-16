import React from 'react';
import { useCurrentFrame } from 'remotion';
import { fadeIn } from '../utils/animation.js';

export interface MultiplicationTableProps {
  multiplier?: number;
  rows?: number;
  startFrame?: number;
  revealInterval?: number;
  top?: string;
  left?: string;
  cellSize?: number;
  primaryColor?: string;
  headerColor?: string;
}

export function MultiplicationTable({
  multiplier = 5,
  rows = 10,
  startFrame = 0,
  revealInterval = 6,
  top = '30%',
  left = '50%',
  cellSize = 80,
  primaryColor = '#4A90D9',
  headerColor = '#FFD700',
}: MultiplicationTableProps): React.ReactElement {
  const frame = useCurrentFrame();
  const revealedRows = Math.min(rows, Math.floor((frame - startFrame) / revealInterval) + 1);

  if (frame < startFrame) return <></> as React.ReactElement;

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        transform: 'translateX(-50%)',
        opacity: fadeIn(frame, startFrame, 10),
      }}
    >
      <table style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={headerCellStyle(headerColor, cellSize)}>x</th>
            <th style={headerCellStyle(headerColor, cellSize)}>{multiplier}</th>
            <th style={headerCellStyle(headerColor, cellSize)}>=</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: revealedRows }, (_, i) => (
            <tr key={i}>
              <td style={cellStyle(primaryColor, cellSize)}>{i + 1}</td>
              <td style={cellStyle(primaryColor, cellSize)}>{multiplier}</td>
              <td style={{ ...cellStyle(primaryColor, cellSize), color: headerColor, fontWeight: 900 }}>
                {(i + 1) * multiplier}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function headerCellStyle(color: string, size: number): React.CSSProperties {
  return {
    width: size,
    height: size * 0.7,
    textAlign: 'center',
    fontSize: size * 0.4,
    fontWeight: 900,
    color,
    fontFamily: '\'Segoe UI\', system-ui, sans-serif',
    borderBottom: `3px solid ${color}`,
  };
}

function cellStyle(color: string, size: number): React.CSSProperties {
  return {
    width: size,
    height: size * 0.7,
    textAlign: 'center',
    fontSize: size * 0.4,
    fontWeight: 700,
    color: '#ffffff',
    fontFamily: '\'Segoe UI\', system-ui, monospace',
    border: `1px solid ${color}40`,
    padding: 0,
  };
}
