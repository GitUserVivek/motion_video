import React from 'react';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import { useProjectStore } from '../store/projectStore.js';
import { VideoPlayer } from '../components/VideoPlayer.js';
import { ErrorNotice, LoadingState, errorMessage } from '../components/Feedback.js';
import { api } from '../api/client.js';
import { useQuery } from '@tanstack/react-query';

export function VideoPreview(): React.ReactElement {
  const navigate = useNavigate();
  const { completedVideoId, reset } = useProjectStore();

  const videosQuery = useQuery({
    queryKey: ['videos'],
    queryFn: api.listVideos,
    enabled: !!completedVideoId,
  });

  if (!completedVideoId) return <Navigate to="/history" replace />;

  const video = videosQuery.data?.find((v) => v.id === completedVideoId);
  const downloadUrl = api.downloadUrl(completedVideoId);

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff' }}>Your Video</h1>
        <Link to="/history" style={{ fontSize: 13, color: '#a0a0c0', whiteSpace: 'nowrap' }}>← Back to History</Link>
      </div>

      {videosQuery.isError ? (
        <ErrorNotice
          message={errorMessage(videosQuery.error, 'Could not load video details. Playback may still work.')}
          onRetry={() => void videosQuery.refetch()}
        />
      ) : videosQuery.isPending ? (
        <LoadingState label="Loading video details…" />
      ) : video ? (
        <div style={{ marginBottom: 20, padding: '14px 16px', backgroundColor: '#1e1e36', borderRadius: 10, border: '1px solid #2a2a4a' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{video.title}</div>
          <div style={{ fontSize: 12, color: '#666' }}>
            {video.durationSeconds.toFixed(1)}s • {(video.sizeBytes / 1024 / 1024).toFixed(2)} MB • {new Date(video.createdAt).toLocaleString()}
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 8, backgroundColor: '#c9a22715', border: '1px solid #c9a227', color: '#c9a227', fontSize: 13 }}>
          This video is no longer in your history. Playback and download may still work if the file is on disk.
        </div>
      )}

      <VideoPlayer
        videoId={completedVideoId}
        title={video?.title}
        poster={video?.thumbnailUrl ?? undefined}
      />

      <div style={{ marginTop: 32, padding: '16px', backgroundColor: '#1e1e36', borderRadius: 10, border: '1px solid #2a2a4a', fontSize: 13, color: '#888' }}>
        <div style={{ marginBottom: 6, fontWeight: 600, color: '#a0a0c0' }}>Share or download link</div>
        <a href={downloadUrl} style={{ wordBreak: 'break-all', color: '#4A90D9' }}>{downloadUrl}</a>
      </div>

      <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => { reset(); navigate('/create'); }}
          style={{ flex: '1 1 160px', padding: '12px', backgroundColor: '#4A90D9', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700 }}
        >
          + Create Another
        </button>
        <Link
          to="/history"
          style={{ flex: '1 1 160px', padding: '12px', backgroundColor: '#1e1e36', color: '#a0a0c0', border: '1px solid #3a3a5a', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none', textAlign: 'center' }}
        >
          View History
        </Link>
      </div>
    </div>
  );
}
