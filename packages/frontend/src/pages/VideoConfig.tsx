import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useProjectStore } from '../store/projectStore.js';
import {
  DURATION_OPTIONS,
  ANIMATION_THEMES,
  VOICES,
  ASPECT_RATIOS,
  resolveInstructor,
} from '@edumotion/shared';
import type { AspectRatio, AnimationTheme } from '@edumotion/shared';
import { ErrorNotice, errorMessage } from '../components/Feedback.js';

export function VideoConfig(): React.ReactElement {
  const navigate = useNavigate();
  const { script, videoConfig, setVideoConfig, setActiveJob } = useProjectStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!script) return <Navigate to="/create" replace />;

  const dimensions = ASPECT_RATIOS[videoConfig.aspectRatio];
  const instructor = resolveInstructor(videoConfig.voice);

  async function handleGenerate(): Promise<void> {
    setError(null);
    setLoading(true);
    try {
      const job = await api.generateVideo(script!.scriptId, videoConfig);
      setActiveJob(job.jobId);
      navigate('/render');
    } catch (e) {
      setError(errorMessage(e, 'Failed to start render'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4, color: '#fff' }}>Video Settings</h1>
          <p style={{ color: '#666', fontSize: 13 }}>Choose how the final video should look and sound.</p>
        </div>
        <Link to="/script" style={{ fontSize: 13, color: '#a0a0c0', whiteSpace: 'nowrap' }}>← Edit script</Link>
      </div>

      <div style={card}>
        <label style={labelStyle}>Duration</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {DURATION_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setVideoConfig({ duration: d })}
              disabled={loading}
              aria-pressed={videoConfig.duration === d}
              style={{
                flex: '1 1 90px', padding: '10px 0', borderRadius: 8,
                border: `1px solid ${videoConfig.duration === d ? '#4A90D9' : '#3a3a5a'}`,
                backgroundColor: videoConfig.duration === d ? '#4A90D920' : 'transparent',
                color: videoConfig.duration === d ? '#4A90D9' : '#a0a0c0',
                fontWeight: 700, fontSize: 14,
              }}
            >{d}s</button>
          ))}
        </div>
        <p style={{ fontSize: 12, color: '#666', marginTop: -12, marginBottom: 20 }}>
          Longer videos take more time to render.
        </p>

        <label style={labelStyle}>Aspect Ratio</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {(['9:16', '16:9', '1:1'] as AspectRatio[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setVideoConfig({ aspectRatio: r })}
              disabled={loading}
              aria-pressed={videoConfig.aspectRatio === r}
              style={{
                flex: '1 1 110px', padding: '10px 8px', borderRadius: 8,
                border: `1px solid ${videoConfig.aspectRatio === r ? '#4A90D9' : '#3a3a5a'}`,
                backgroundColor: videoConfig.aspectRatio === r ? '#4A90D920' : 'transparent',
                color: videoConfig.aspectRatio === r ? '#4A90D9' : '#a0a0c0',
                fontWeight: 600, fontSize: 13,
              }}
            >
              {ASPECT_RATIOS[r].label}
            </button>
          ))}
        </div>

        <label style={labelStyle}>Animation Theme</label>
        <select
          value={videoConfig.animationTheme}
          onChange={(e) => setVideoConfig({ animationTheme: e.target.value as AnimationTheme })}
          disabled={loading}
          style={{ marginBottom: 20 }}
        >
          {ANIMATION_THEMES.map((t) => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>

        <label style={labelStyle}>Voice</label>
        <select
          value={videoConfig.voice}
          onChange={(e) => setVideoConfig({ voice: e.target.value })}
          disabled={loading}
          style={{ marginBottom: 20 }}
        >
          {Object.entries(VOICES).map(([id, v]) => (
            <option key={id} value={id}>{v.label}</option>
          ))}
        </select>
        <p style={{ fontSize: 12, color: '#8f8faa', marginTop: -12, marginBottom: 20 }}>
          Instructor: <strong style={{ color: '#c9c9e0' }}>{instructor.name}</strong> — the presenter changes with the selected voice.
        </p>

        <div style={{ display: 'flex', gap: 24, marginBottom: 20, flexWrap: 'wrap' }}>
          {([['subtitles', 'Subtitles'], ['backgroundMusic', 'Background Music']] as const).map(([key, label]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: '#a0a0c0' }}>
              <input
                type="checkbox"
                checked={videoConfig[key]}
                onChange={(e) => setVideoConfig({ [key]: e.target.checked })}
                disabled={loading}
                style={{ width: 'auto', accentColor: '#4A90D9' }}
              />
              {label}
            </label>
          ))}
        </div>

        <div style={{
          padding: '12px 14px', borderRadius: 8, backgroundColor: '#16162a',
          border: '1px solid #2a2a44', color: '#8f8faa', fontSize: 12, lineHeight: 1.6,
        }}>
          Output: {dimensions.width} × {dimensions.height} • {videoConfig.fps} fps •{' '}
          {dimensions.label} • {videoConfig.duration}s
        </div>
      </div>

      {error && <ErrorNotice message={error} />}

      <button
        type="button"
        onClick={() => void handleGenerate()}
        disabled={loading}
        aria-busy={loading}
        style={primaryBtn}
      >
        {loading ? '⏳ Queuing…' : '🎬 Create Video'}
      </button>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, color: '#888', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' };
const card: React.CSSProperties = { backgroundColor: '#1e1e36', border: '1px solid #2a2a4a', borderRadius: 12, padding: 24, marginBottom: 20 };
const primaryBtn: React.CSSProperties = { width: '100%', padding: '14px', backgroundColor: '#4A90D9', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700 };
