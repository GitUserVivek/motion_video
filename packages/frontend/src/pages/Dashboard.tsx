import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useProjectStore } from '../store/projectStore.js';

function ServiceBadge({ ok, label }: { ok: boolean; label: string }): React.ReactElement {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 14px', borderRadius: 8,
      backgroundColor: ok ? '#2ecc7120' : '#e74c3c20',
      border: `1px solid ${ok ? '#2ecc71' : '#e74c3c'}`,
      fontSize: 13, color: ok ? '#2ecc71' : '#e74c3c',
    }}>
      <span>{ok ? '✓' : '✗'}</span> {label}
    </div>
  );
}

export function Dashboard(): React.ReactElement {
  const reset = useProjectStore((s) => s.reset);
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 15000,
  });
  const { data: videos } = useQuery({
    queryKey: ['videos'],
    queryFn: api.listVideos,
  });

  const recentVideos = videos?.slice(0, 3) ?? [];

  return (
    <div>
      <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8, color: '#fff' }}>
        🎬 EduMotion AI
      </h1>
      <p style={{ color: '#888', marginBottom: 32 }}>
        Local AI-powered educational video generator
      </p>

      {/* Service Health */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 16, color: '#a0a0c0', marginBottom: 12, fontWeight: 600 }}>SERVICE HEALTH</h2>
        {health ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <ServiceBadge ok={health.services.database} label="Database" />
            <ServiceBadge ok={health.services.llm} label="Local LLM" />
            <ServiceBadge ok={health.services.ffmpeg} label="FFmpeg" />
            <ServiceBadge ok={health.services.tts} label="TTS" />
            <ServiceBadge ok={health.status === 'ok'} label={`Status: ${health.status}`} />
          </div>
        ) : (
          <p style={{ color: '#666' }}>Checking services…</p>
        )}
      </section>

      {/* Quick Start */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 16, color: '#a0a0c0', marginBottom: 12, fontWeight: 600 }}>QUICK START</h2>
        <div style={{ display: 'flex', gap: 16 }}>
          <Link
            to="/create"
            onClick={reset}
            style={{
              flex: 1, padding: '24px', borderRadius: 12,
              backgroundColor: '#1e1e36', border: '1px solid #3a3a5a',
              textDecoration: 'none', color: '#fff', textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 8 }}>💡</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>From Topic</div>
            <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>AI generates your script</div>
          </Link>
          <Link
            to="/create"
            onClick={reset}
            style={{
              flex: 1, padding: '24px', borderRadius: 12,
              backgroundColor: '#1e1e36', border: '1px solid #3a3a5a',
              textDecoration: 'none', color: '#fff', textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 8 }}>📝</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Own Script</div>
            <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Paste your narration</div>
          </Link>
        </div>
      </section>

      {/* Recent Videos */}
      {recentVideos.length > 0 && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, color: '#a0a0c0', fontWeight: 600 }}>RECENT VIDEOS</h2>
            <Link to="/history" style={{ fontSize: 13, color: '#4A90D9' }}>View all →</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recentVideos.map((v) => (
              <div key={v.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 16px', backgroundColor: '#1e1e36', borderRadius: 10,
                border: '1px solid #2a2a4a',
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{v.title}</div>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                    {v.durationSeconds.toFixed(0)}s • {(v.sizeBytes / 1024 / 1024).toFixed(1)} MB
                  </div>
                </div>
                <a href={v.downloadUrl} style={{ color: '#4A90D9', fontSize: 13 }}>↓ Download</a>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
