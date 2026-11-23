import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { VideoPlayer } from '../components/VideoPlayer.js';
import { ErrorNotice, LoadingState, errorMessage } from '../components/Feedback.js';
import { useProjectStore } from '../store/projectStore.js';
import { STEP_LABELS, type VideoListItem } from '@edumotion/shared';

export function History(): React.ReactElement {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const setActiveJob = useProjectStore((state) => state.setActiveJob);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [resuming, setResuming] = useState<string | null>(null);
  const [playing, setPlaying] = useState<VideoListItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const videosQuery = useQuery({
    queryKey: ['videos'],
    queryFn: api.listVideos,
  });

  // A failed render never produces a video row, so without jobs the history
  // page looks empty and the error is invisible.
  const jobsQuery = useQuery({
    queryKey: ['jobs'],
    queryFn: api.listJobs,
    refetchInterval: 5000,
  });

  const videos = videosQuery.data;
  const jobs = jobsQuery.data;

  const activeJobs = (jobs ?? []).filter(
    (job) => job.status === 'pending' || job.status === 'processing',
  );
  const failedJobs = (jobs ?? []).filter(
    (job) => job.status === 'failed' || job.status === 'cancelled',
  );

  useEffect(() => {
    if (!playing) return;
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') setPlaying(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing]);

  async function handleDelete(id: string): Promise<void> {
    if (!confirm('Delete this video? This cannot be undone.')) return;
    setDeleting(id);
    setActionError(null);
    try {
      await api.deleteVideo(id);
      await qc.invalidateQueries({ queryKey: ['videos'] });
    } catch (e) {
      setActionError(errorMessage(e, 'Could not delete this video.'));
    } finally {
      setDeleting(null);
    }
  }

  async function handleResume(jobId: string): Promise<void> {
    setResuming(jobId);
    setActionError(null);
    try {
      await api.resumeJob(jobId);
      await qc.invalidateQueries({ queryKey: ['jobs'] });
      setActiveJob(jobId);
      navigate('/render');
    } catch (e) {
      setActionError(errorMessage(e, 'Could not resume this job.'));
    } finally {
      setResuming(null);
    }
  }

  function handleOpenJob(jobId: string): void {
    setActiveJob(jobId);
    navigate('/render');
  }

  const hasNothing =
    !videosQuery.isPending &&
    !jobsQuery.isPending &&
    !videosQuery.isError &&
    !jobsQuery.isError &&
    !videos?.length &&
    !activeJobs.length &&
    !failedJobs.length;

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24, color: '#fff' }}>Generation History</h1>

      {videosQuery.isError && (
        <ErrorNotice
          message={errorMessage(videosQuery.error, 'Could not load your videos.')}
          onRetry={() => void videosQuery.refetch()}
        />
      )}
      {jobsQuery.isError && (
        <ErrorNotice
          message={errorMessage(jobsQuery.error, 'Could not load your render jobs.')}
          onRetry={() => void jobsQuery.refetch()}
        />
      )}
      {actionError && <ErrorNotice message={actionError} />}

      {activeJobs.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#a0a0c0', margin: '0 0 12px' }}>
            In progress
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {activeJobs.map((job) => (
              <div key={job.jobId} style={rowStyle}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: '#4A90D9' }}>
                      {job.status.toUpperCase()}
                    </span>
                    <code style={{ fontSize: 11, color: '#555' }}>{job.jobId}</code>
                  </div>
                  <div style={{ fontSize: 13, color: '#d0d0e0', marginBottom: 8 }}>
                    {STEP_LABELS[job.currentStep] ?? job.currentStep}
                  </div>
                  <div style={{ height: 5, borderRadius: 5, backgroundColor: '#2a2a4a', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${Math.round(job.progress)}%`,
                      backgroundColor: '#4A90D9', borderRadius: 5,
                    }} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#4A90D9' }}>
                    {Math.round(job.progress)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => handleOpenJob(job.jobId)}
                    style={btnSmall}
                  >
                    View progress →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {videosQuery.isPending ? (
        <LoadingState label="Loading videos…" />
      ) : videos?.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {videos.map((v) => (
            <div key={v.id} style={rowStyle}>
              <button
                type="button"
                onClick={() => setPlaying(v)}
                aria-label={`Play ${v.title}`}
                style={{
                  position: 'relative', padding: 0, border: 'none', background: 'none',
                  cursor: 'pointer', flexShrink: 0, lineHeight: 0,
                }}
              >
                {v.thumbnailUrl ? (
                  <img src={v.thumbnailUrl} alt="" style={{ width: 80, height: 48, borderRadius: 6, objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ width: 80, height: 48, borderRadius: 6, backgroundColor: '#2a2a4a' }} />
                )}
                <span
                  style={{
                    position: 'absolute', inset: 0, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 6,
                    color: '#fff', fontSize: 16, lineHeight: 1,
                  }}
                >
                  ▶
                </span>
              </button>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.title}</div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  {v.durationSeconds.toFixed(0)}s • {(v.sizeBytes / 1024 / 1024).toFixed(2)} MB • {new Date(v.createdAt).toLocaleString()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setPlaying(v)} style={btnSmall}>▶ Play</button>
                <a href={api.downloadUrl(v.id)} style={btnSmall}>↓ Download</a>
                <button
                  type="button"
                  onClick={() => void handleDelete(v.id)}
                  disabled={deleting === v.id}
                  aria-label={`Delete ${v.title}`}
                  style={{ ...btnSmall, color: '#e74c3c', borderColor: '#e74c3c', backgroundColor: 'transparent' }}
                >
                  {deleting === v.id ? '…' : '🗑'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : !hasNothing ? (
        <p style={{ fontSize: 13, color: '#666' }}>No completed videos yet.</p>
      ) : null}

      {failedJobs.length > 0 && (
        <section style={{ marginTop: videos?.length || activeJobs.length ? 24 : 0 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#a0a0c0', margin: '0 0 12px' }}>
            Failed renders
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {failedJobs.map((job) => (
              <div key={job.jobId} style={rowStyle}>
                <div style={{ flex: 1, minWidth: 180 }}>
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
                <button
                  type="button"
                  onClick={() => void handleResume(job.jobId)}
                  disabled={resuming === job.jobId}
                  aria-busy={resuming === job.jobId}
                  style={{ ...btnSmall, flexShrink: 0 }}
                >
                  {resuming === job.jobId ? '…' : '↻ Resume'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {hasNothing && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#555' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎬</div>
          <p>No videos yet. <Link to="/create" style={{ color: '#4A90D9' }}>Create your first one.</Link></p>
        </div>
      )}

      {playing && (
        <div
          onClick={() => setPlaying(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: '100%', maxWidth: 560,
              backgroundColor: '#16162a',
              border: '1px solid #2a2a4a',
              borderRadius: 14,
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {playing.title}
              </div>
              <button
                type="button"
                onClick={() => setPlaying(null)}
                aria-label="Close player"
                style={{ ...btnSmall, padding: '4px 10px' }}
              >
                ✕
              </button>
            </div>
            <VideoPlayer
              key={playing.id}
              videoId={playing.id}
              title={playing.title}
              poster={playing.thumbnailUrl ?? undefined}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
  padding: '16px 20px', backgroundColor: '#1e1e36',
  borderRadius: 10, border: '1px solid #2a2a4a',
};

const btnSmall: React.CSSProperties = { padding: '6px 14px', borderRadius: 6, border: '1px solid #3a3a5a', backgroundColor: '#2a2a4a', color: '#a0a0c0', fontSize: 12, fontWeight: 600, textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap' };
