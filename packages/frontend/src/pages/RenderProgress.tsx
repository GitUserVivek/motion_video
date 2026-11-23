import React, { useEffect, useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useProjectStore } from '../store/projectStore.js';
import { ProgressTracker } from '../components/ProgressTracker.js';
import { VideoPlayer } from '../components/VideoPlayer.js';
import { ErrorNotice, LoadingState, errorMessage } from '../components/Feedback.js';
import { STEP_LABELS, type SceneAssetUsage } from '@edumotion/shared';

const STEPS = [
  'generating_audio',
  'aligning_subtitles',
  'discovering_assets',
  'planning_storyboard',
  'rendering',
  'muxing',
  'validating',
  'saving',
  'completed',
];

/** Group the flat per-tile report into one block per scene. */
function groupByScene(assets: SceneAssetUsage[]): Array<[number, SceneAssetUsage[]]> {
  const scenes = new Map<number, SceneAssetUsage[]>();
  for (const use of assets) {
    const picks = scenes.get(use.sceneIndex);
    if (picks) picks.push(use);
    else scenes.set(use.sceneIndex, [use]);
  }
  return [...scenes.entries()].sort((a, b) => a[0] - b[0]);
}

/**
 * The picture a tile actually used. Downloaded and library files come back with
 * a preview URL from the API; a built-in glyph has no file to fetch, so it gets
 * a neutral tile rather than a broken image.
 */
function AssetPreview({ pick }: { pick: SceneAssetUsage }): React.ReactElement {
  if (pick.previewUrl) {
    return (
      <img
        src={pick.previewUrl}
        alt={pick.label}
        loading="lazy"
        style={{
          width: 44,
          height: 44,
          flexShrink: 0,
          padding: 4,
          borderRadius: 8,
          objectFit: 'contain',
          backgroundColor: '#0f0f1e',
          border: '1px solid #2a2a44',
        }}
      />
    );
  }

  return (
    <div
      title={`Built-in glyph: ${pick.icon}`}
      style={{
        width: 44,
        height: 44,
        flexShrink: 0,
        padding: 4,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0f0f1e',
        border: '1px dashed #3a3a5a',
        color: '#6a6a85',
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: 0.3,
        textAlign: 'center',
        textTransform: 'uppercase',
        overflow: 'hidden',
      }}
    >
      {pick.icon}
    </div>
  );
}

export function RenderProgress(): React.ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeJobId, setCompletedVideo, reset } = useProjectStore();
  const [actionBusy, setActionBusy] = useState<'cancel' | 'resume' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const jobQuery = useQuery({
    queryKey: ['job', activeJobId],
    queryFn: () => api.getJob(activeJobId!),
    enabled: !!activeJobId,
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (status === 'completed' || status === 'failed' || status === 'cancelled') return false;
      return 2000;
    },
  });
  const job = jobQuery.data;

  // The artwork report changes at most once per job, so it is fetched once from
  // its own endpoint instead of being repeated in every 2-second poll.
  const assetsQuery = useQuery({
    queryKey: ['job-assets', activeJobId],
    queryFn: () => api.getJobAssets(activeJobId!),
    enabled: !!activeJobId && job?.assetsAvailable === true,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  const assetReport = assetsQuery.data;

  // Stay on this page and play the result here; the preview route is still
  // reachable from the link below for sharing/download details.
  useEffect(() => {
    if (job?.status === 'completed' && job.videoId) {
      setCompletedVideo(job.videoId);
    }
  }, [job?.status, job?.videoId, setCompletedVideo]);

  if (!activeJobId) return <Navigate to="/create" replace />;

  async function handleCancel(): Promise<void> {
    if (!activeJobId || actionBusy) return;
    if (!window.confirm('Cancel this render? The job can be resumed later.')) return;

    setActionBusy('cancel');
    setActionError(null);
    try {
      await api.cancelJob(activeJobId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['job', activeJobId] }),
        queryClient.invalidateQueries({ queryKey: ['jobs'] }),
      ]);
    } catch (e) {
      setActionError(errorMessage(e, 'Could not cancel this job.'));
    } finally {
      setActionBusy(null);
    }
  }

  async function handleResume(): Promise<void> {
    if (!activeJobId || actionBusy) return;

    setActionBusy('resume');
    setActionError(null);
    try {
      await api.resumeJob(activeJobId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['job', activeJobId] }),
        queryClient.invalidateQueries({ queryKey: ['jobs'] }),
      ]);
    } catch (e) {
      setActionError(errorMessage(e, 'Could not resume this job.'));
    } finally {
      setActionBusy(null);
    }
  }

  const completed = job?.status === 'completed';

  const assets = assetReport?.assets ?? [];
  const downloadedCount = assets.filter((use) => use.source === 'downloaded').length;
  const libraryCount = assets.filter((use) => use.source === 'library').length;
  const builtinCount = assets.filter((use) => use.source === 'builtin').length;
  const userCount = assets.filter((use) => use.source === 'user').length;

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 8 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff' }}>
          {completed ? (job?.videoId ? 'Your Video Is Ready' : 'Render Complete') : 'Rendering Video'}
        </h1>
        <Link to="/history" style={{ fontSize: 13, color: '#a0a0c0', whiteSpace: 'nowrap' }}>← History</Link>
      </div>
      <p style={{ color: '#666', marginBottom: 24, fontSize: 13 }}>
        Job ID: <code>{activeJobId}</code>
      </p>

      {jobQuery.isError && (
        <ErrorNotice
          message={errorMessage(jobQuery.error, 'Could not refresh this render. Retrying may restore it.')}
          onRetry={() => void jobQuery.refetch()}
        />
      )}
      {!job && jobQuery.isPending ? (
        <LoadingState label="Loading job status…" />
      ) : job ? (
        <>
          {/* While rendering, show the progress phases. Once the video is done,
              the phases are replaced on screen by the finished video itself. */}
          {!completed ? (
            <>
              <ProgressTracker
                progress={job.progress}
                currentStep={job.currentStep}
                status={job.status}
                error={job.error}
                scenesCompleted={job.scenesCompleted}
                scenesTotal={job.scenesTotal}
              />

              {/* Step list */}
              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {STEPS.map((step) => {
                  const stepIndex = STEPS.indexOf(step);
                  const currentIndex = STEPS.indexOf(job.currentStep);
                  const done = stepIndex < currentIndex || job.status === 'completed';
                  const active = step === job.currentStep && job.status === 'processing';
                  return (
                    <div key={step} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px', borderRadius: 8,
                      backgroundColor: active ? '#4A90D920' : 'transparent',
                      border: `1px solid ${active ? '#4A90D9' : 'transparent'}`,
                      fontSize: 13,
                      color: done ? '#2ecc71' : active ? '#4A90D9' : '#555',
                    }}>
                      <span>{done ? '✓' : active ? '⏳' : '○'}</span>
                      {STEP_LABELS[step] ?? step}
                      {step === 'rendering' && typeof job.scenesTotal === 'number' && job.scenesTotal > 0 && (
                        <span style={{ fontSize: 11, color: '#8f7be0' }}>
                          scene {job.scenesCompleted ?? 0}/{job.scenesTotal}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {actionError && <ErrorNotice message={actionError} />}

              {['failed', 'cancelled'].includes(job.status) && (
                <button
                  type="button"
                  onClick={() => void handleResume()}
                  disabled={!!actionBusy}
                  aria-busy={actionBusy === 'resume'}
                  style={{ marginTop: 20, padding: '10px 20px', backgroundColor: '#4A90D920', color: '#4A90D9', border: '1px solid #4A90D9', borderRadius: 8, fontSize: 13, fontWeight: 600 }}
                >
                  {actionBusy === 'resume' ? '⏳ Resuming…' : '↻ Resume Job'}
                </button>
              )}
            </>
          ) : (
            <section style={{ marginTop: 4 }}>
              <div style={{
                padding: '12px 16px', marginBottom: 16, borderRadius: 10,
                backgroundColor: '#2ecc7115', border: '1px solid #2ecc71',
                color: '#2ecc71', fontSize: 13, fontWeight: 700,
              }}>
                ✓ Render complete — the video is ready to watch
              </div>

              {job.videoId ? (
                <VideoPlayer videoId={job.videoId} poster={api.thumbnailUrl(job.videoId)} />
              ) : (
                <div style={{ padding: '20px 16px', borderRadius: 10, backgroundColor: '#16162a', border: '1px solid #2a2a44', color: '#a0a0c0', fontSize: 13 }}>
                  The job completed, but the video file is not available. Check the output folder for this job.
                </div>
              )}

              <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => { reset(); navigate('/create'); }}
                  style={{ flex: '1 1 150px', padding: '12px', backgroundColor: '#4A90D9', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700 }}
                >
                  + Create Another
                </button>
                <Link
                  to="/preview"
                  style={{ flex: '1 1 150px', padding: '12px', backgroundColor: '#1e1e36', color: '#a0a0c0', border: '1px solid #3a3a5a', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none', textAlign: 'center' }}
                >
                  Video details
                </Link>
                <Link
                  to="/history"
                  style={{ flex: '1 1 150px', padding: '12px', backgroundColor: '#1e1e36', color: '#a0a0c0', border: '1px solid #3a3a5a', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none', textAlign: 'center' }}
                >
                  History
                </Link>
              </div>
            </section>
          )}

          {/* Artwork used: re-added and kept visible both while rendering and
              after completion, so the tiles each scene took stay on screen. */}
          {job.assetsAvailable ? (
            <section style={{ marginTop: 24 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#e0e0f0', marginBottom: 4 }}>
                Artwork used
              </h2>

              {assetsQuery.isError ? (
                <ErrorNotice
                  message={errorMessage(assetsQuery.error, 'Could not load the artwork report.')}
                  onRetry={() => void assetsQuery.refetch()}
                />
              ) : assets.length > 0 ? (
                <>
                  <p style={{ color: '#666', fontSize: 12, marginTop: 0, marginBottom: 12 }}>
                    {userCount} your upload{userCount === 1 ? '' : 's'} · {downloadedCount} downloaded ·{' '}
                    {libraryCount} from the local library · {builtinCount} built-in glyph{builtinCount === 1 ? '' : 's'}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {groupByScene(assets).map(([sceneIndex, picks]) => (
                      <div
                        key={sceneIndex}
                        style={{
                          backgroundColor: '#16162a',
                          border: '1px solid #2a2a44',
                          borderRadius: 10,
                          padding: '10px 14px',
                        }}
                      >
                        <div style={{ fontSize: 11, letterSpacing: 0.6, color: '#7a7a9a', marginBottom: 6 }}>
                          SCENE {sceneIndex + 1}
                        </div>
                        {picks.map((pick, i) => (
                          <div
                            key={`${pick.label}-${i}`}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}
                          >
                            <AssetPreview pick={pick} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: '#e6e6f0', fontSize: 12 }}>{pick.label}</div>
                              <div
                                title={pick.asset ?? `built-in glyph (${pick.icon})`}
                                style={{
                                  fontFamily: 'monospace',
                                  fontSize: 10,
                                  color: pick.asset ? '#8f7be0' : '#6a6a85',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {pick.asset ?? `built-in glyph (${pick.icon})`}
                              </div>
                            </div>
                            {pick.source === 'user' ? (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: '#2ecc71',
                                  border: '1px solid #2ecc71',
                                  borderRadius: 4,
                                  padding: '1px 5px',
                                  flexShrink: 0,
                                }}
                              >
                                YOURS
                              </span>
                            ) : pick.source === 'downloaded' ? (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: '#4A90D9',
                                  border: '1px solid #4A90D9',
                                  borderRadius: 4,
                                  padding: '1px 5px',
                                  flexShrink: 0,
                                }}
                              >
                                NEW
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </>
              ) : assetsQuery.isPending ? (
                <LoadingState label="Loading artwork…" />
              ) : (
                <p style={{ color: '#666', fontSize: 12 }}>
                  No artwork was picked for this job.
                </p>
              )}
            </section>
          ) : null}

          {['pending', 'processing'].includes(job.status) && (
            <>
              {actionError && <ErrorNotice message={actionError} />}
              <button
                type="button"
                onClick={() => void handleCancel()}
                disabled={!!actionBusy}
                aria-busy={actionBusy === 'cancel'}
                style={{ marginTop: 24, padding: '10px 20px', backgroundColor: '#e74c3c20', color: '#e74c3c', border: '1px solid #e74c3c', borderRadius: 8, fontSize: 13, fontWeight: 600 }}
              >
                {actionBusy === 'cancel' ? '⏳ Cancelling…' : 'Cancel Job'}
              </button>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
