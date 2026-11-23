import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useProjectStore } from '../store/projectStore.js';
import { DURATION_OPTIONS, ANIMATION_THEMES, VOICES } from '@edumotion/shared';
import type { AspectRatio, AnimationTheme } from '@edumotion/shared';

export function VideoConfig(): React.ReactElement {
  const navigate = useNavigate();
  const { script, videoConfig, setVideoConfig, setActiveJob } = useProjectStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!script) { navigate('/create'); return <></>; }

  async function handleGenerate(): Promise<void> {
    setError(null);
    setLoading(true);
    try {
      const job = await api.generateVideo(script!.scriptId, videoConfig);
      setActiveJob(job.jobId);
      navigate('/render');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start render');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24, color: '#fff' }}>Video Settings</h1>

      <div style={card}>
        <label style={labelStyle}>Duration</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {DURATION_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setVideoConfig({ duration: d })}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 8,
                border: `1px solid ${videoConfig.duration === d ? '#4A90D9' : '#3a3a5a'}`,
                backgroundColor: videoConfig.duration === d ? '#4A90D920' : 'transparent',
                color: videoConfig.duration === d ? '#4A90D9' : '#a0a0c0',
                fontWeight: 700, fontSize: 14,
              }}
            >{d}s</button>
          ))}
        </div>

        <label style={labelStyle}>Aspect Ratio</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {(['9:16', '16:9', '1:1'] as AspectRatio[]).map((r) => (
            <button
              key={r}
              onClick={() => setVideoConfig({ aspectRatio: r })}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 8,
                border: `1px solid ${videoConfig.aspectRatio === r ? '#4A90D9' : '#3a3a5a'}`,
                backgroundColor: videoConfig.aspectRatio === r ? '#4A90D920' : 'transparent',
                color: videoConfig.aspectRatio === r ? '#4A90D9' : '#a0a0c0',
                fontWeight: 600, fontSize: 13,
              }}
            >{r}</button>
          ))}
        </div>

        <label style={labelStyle}>Animation Theme</label>
        <select
          value={videoConfig.animationTheme}
          onChange={(e) => setVideoConfig({ animationTheme: e.target.value as AnimationTheme })}
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
          style={{ marginBottom: 20 }}
        >
          {Object.entries(VOICES).map(([id, v]) => (
            <option key={id} value={id}>{v.label}</option>
          ))}
        </select>

        <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
          {([['subtitles', 'Subtitles'], ['backgroundMusic', 'Background Music']] as const).map(([key, label]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: '#a0a0c0' }}>
              <input
                type="checkbox"
                checked={videoConfig[key]}
                onChange={(e) => setVideoConfig({ [key]: e.target.checked })}
                style={{ width: 'auto', accentColor: '#4A90D9' }}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', backgroundColor: '#e74c3c20', border: '1px solid #e74c3c', borderRadius: 8, color: '#e74c3c', fontSize: 13, marginBottom: 16 }}>{error}</div>
      )}

      <button onClick={() => void handleGenerate()} disabled={loading} style={primaryBtn}>
        {loading ? '⏳ Queuing…' : '🎬 Create Video'}
      </button>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, color: '#888', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' };
const card: React.CSSProperties = { backgroundColor: '#1e1e36', border: '1px solid #2a2a4a', borderRadius: 12, padding: 24, marginBottom: 20 };
const primaryBtn: React.CSSProperties = { width: '100%', padding: '14px', backgroundColor: '#4A90D9', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700 };
