import React from 'react';
import { api } from '../api/client.js';

interface VideoPlayerProps {
  videoId: string;
  title?: string;
}

export function VideoPlayer({ videoId, title }: VideoPlayerProps): React.ReactElement {
  const url = api.downloadUrl(videoId);

  return (
    <div style={{ textAlign: 'center' }}>
      <video
        src={url}
        controls
        style={{
          maxWidth: '100%',
          maxHeight: 600,
          borderRadius: 12,
          border: '1px solid #2a2a4a',
          backgroundColor: '#000',
        }}
      />
      <div style={{ marginTop: 16, display: 'flex', gap: 12, justifyContent: 'center' }}>
        <a
          href={url}
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
