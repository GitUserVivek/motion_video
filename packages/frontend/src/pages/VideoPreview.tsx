import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useProjectStore } from '../store/projectStore.js';
import { VideoPlayer } from '../components/VideoPlayer.js';
import { api } from '../api/client.js';
import { useQuery } from '@tanstack/react-query';

export function VideoPreview(): React.ReactElement {
  const navigate = useNavigate();
  const { completedVideoId, reset } = useProjectStore();

  const { data: videos } = useQuery({
    queryKey: ['videos'],
    queryFn: api.listVideos,
    enabled: !!completedVideoId,
  });

  const video = videos?.find((v) => v.id === completedVideoId);

  if (!completedVideoId) {
    navigate('/history');
    return <></>;
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff' }}>Your Video</h1>
        <Link to="/history" style={{ fontSize: 13, color: '#a0a0c0' }}>← Back to History</Link>
      </div>

      {video && (
        <div style={{ marginBottom: 20, padding: '14px 16px', backgroundColor: '#1e1e36', borderRadius: 10, border: '1px solid #2a2a4a' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{video.title}</div>
          <div style={{ fontSize: 12, color: '#666' }}>
            {video.durationSeconds.toFixed(1)}s • {(video.sizeBytes / 1024 / 1024).toFixed(2)} MB • {new Date(video.createdAt).toLocaleString()}
          </div>
        </div>
      )}

      <VideoPlayer videoId={completedVideoId} title={video?.title} />

      <div style={{ marginTop: 32, padding: '16px', backgroundColor: '#1e1e36', borderRadius: 10, border: '1px solid #2a2a4a', fontSize: 13, color: '#888' }}>
        <div style={{ marginBottom: 4, fontWeight: 600, color: '#a0a0c0' }}>Download URL</div>
        <code style={{ wordBreak: 'break-all', color: '#4A90D9' }}>{api.downloadUrl(completedVideoId)}</code>
      </div>

      <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
        <button
          onClick={() => { reset(); navigate('/create'); }}
          style={{ flex: 1, padding: '12px', backgroundColor: '#4A90D9', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700 }}
        >
          + Create Another
        </button>
        <Link
          to="/history"
          style={{ flex: 1, padding: '12px', backgroundColor: '#1e1e36', color: '#a0a0c0', border: '1px solid #3a3a5a', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none', textAlign: 'center' }}
        >
          View History
        </Link>
      </div>
    </div>
  );
}
