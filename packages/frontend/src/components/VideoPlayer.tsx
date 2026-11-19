import React from 'react';
import { api } from '../api/client.js';

interface VideoPlayerProps {
  videoId: string;
  title?: string;
  poster?: string;
}

export function VideoPlayer({ videoId, title, poster }: VideoPlayerProps): React.ReactElement {
  // Stream endpoint (byte ranges) rather than the download endpoint, so the
  // player can seek and start before the whole file has been transferred.
  const url = api.streamUrl(videoId);

  return (
    <div style={{ textAlign: 'center' }}>
      <video
        src={url}
        poster={poster}
        controls
        playsInline
        preload="metadata"
        style={{
          width: '100%',
          maxWidth: '100%',
          maxHeight: '70vh',
          borderRadius: 12,
          border: '1px solid #2a2a4a',
          backgroundColor: '#000',
        }}
      />
      <div style={{ marginTop: 16, display: 'flex', gap: 12, justifyContent: 'center' }}>
        <a
          href={api.downloadUrl(videoId)}
          download={title ? `${title}.mp4` : 'video.mp4'}
          style={{
            padding: '10px 24px',
            backgroundColor: '#4A90D9',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          ⬇️ Download MP4
        </a>
      </div>
    </div>
  );
}
