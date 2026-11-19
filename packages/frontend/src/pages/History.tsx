import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';

export function History(): React.ReactElement {
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState<string | null>(null);

  const { data: videos, isLoading } = useQuery({
    queryKey: ['videos'],
    queryFn: api.listVideos,
  });

  // A failed render never produces a video row, so without jobs the history
  // page looks empty and the error is invisible.
  const { data: jobs } = useQuery({
    queryKey: ['jobs'],
    queryFn: api.listJobs,
  });

  const failedJobs = (jobs ?? []).filter(
    (job) => job.status === 'failed' || job.status === 'cancelled',
  );

  async function handleDelete(id: string): Promise<void> {
    if (!confirm('Delete this video? This cannot be undone.')) return;
    setDeleting(id);
    try {
      await api.deleteVideo(id);
      await qc.invalidateQueries({ queryKey: ['videos'] });
    } finally {
      setDeleting(null);
    }
  }

  if (isLoading) return <p style={{ color: '#666' }}>Loading…</p>;

  const hasNothing = !videos?.length && failedJobs.length === 0;

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24, color: '#fff' }}>Generation History</h1>
      {hasNothing ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#555' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎬</div>
          <p>No videos yet. <a href="/create" style={{ color: '#4A90D9' }}>Create your first one.</a></p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {videos?.map((v) => (
            <div key={v.id} style={rowStyle}>
              {v.thumbnailUrl && (
                <img src={v.thumbnailUrl} alt="thumb" style={{ width: 80, height: 48, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.title}</div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  {v.durationSeconds.toFixed(0)}s • {(v.sizeBytes / 1024 / 1024).toFixed(2)} MB • {new Date(v.createdAt).toLocaleString()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <a href={api.downloadUrl(v.id)} style={btnSmall}>↓ Download</a>
                <button
                  onClick={() => void handleDelete(v.id)}
                  disabled={deleting === v.id}
                  style={{ ...btnSmall, color: '#e74c3c', borderColor: '#e74c3c', backgroundColor: 'transparent' }}
                >
                  {deleting === v.id ? '…' : '🗑'}
                </button>
              </div>
            </div>
          ))}

          {failedJobs.length > 0 && (
            <section style={{ marginTop: videos?.length ? 24 : 0 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#a0a0c0', margin: '0 0 12px' }}>
                Failed renders
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {failedJobs.map((job) => (
                  <div key={job.jobId} style={rowStyle}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
                          color: job.status === 'failed' ? '#e74c3c' : '#c9a227',
                        }}>
                          {job.status.toUpperCase()}
                        </span>
                        <code style={{ fontSize: 11, color: '#555' }}>{job.jobId}</code>
                      </div>
                      <pre style={{
                        margin: 0, fontSize: 11, lineHeight: 1.5, color: '#d9a0a0',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 160, overflow: 'auto',
                      }}>
                        {job.error ?? 'No error message recorded.'}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 16,
  padding: '16px 20px', backgroundColor: '#1e1e36',
  borderRadius: 10, border: '1px solid #2a2a4a',
};

const btnSmall: React.CSSProperties = { padding: '6px 14px', borderRadius: 6, border: '1px solid #3a3a5a', backgroundColor: '#2a2a4a', color: '#a0a0c0', fontSize: 12, fontWeight: 600, textDecoration: 'none', cursor: 'pointer' };
