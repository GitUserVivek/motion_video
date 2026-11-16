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

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24, color: '#fff' }}>Generation History</h1>
      {!videos?.length ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#555' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎬</div>
          <p>No videos yet. <a href="/create" style={{ color: '#4A90D9' }}>Create your first one.</a></p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {videos.map((v) => (
            <div key={v.id} style={{
              display: 'flex', alignItems: 'center', gap: 16,
              padding: '16px 20px', backgroundColor: '#1e1e36',
              borderRadius: 10, border: '1px solid #2a2a4a',
            }}>
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
        </div>
      )}
    </div>
  );
}

const btnSmall: React.CSSProperties = { padding: '6px 14px', borderRadius: 6, border: '1px solid #3a3a5a', backgroundColor: '#2a2a4a', color: '#a0a0c0', fontSize: 12, fontWeight: 600, textDecoration: 'none', cursor: 'pointer' };
