import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useProjectStore } from '../store/projectStore.js';
import { ProgressTracker } from '../components/ProgressTracker.js';
import { VideoPlayer } from '../components/VideoPlayer.js';
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

export function RenderProgress(): React.ReactElement {
  const navigate = useNavigate();
  const { activeJobId, setCompletedVideo, reset } = useProjectStore();

  const { data: job } = useQuery({
    queryKey: ['job', activeJobId],
    queryFn: () => api.getJob(activeJobId!),
    enabled: !!activeJobId,
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (status === 'completed' || status === 'failed' || status === 'cancelled') return false;
      return 2000;
    },
  });

  // Stay on this page and play the result here; the preview route is still
  // reachable from the link below for sharing/download details.
  useEffect(() => {
    if (job?.status === 'completed' && job.videoId) {
      setCompletedVideo(job.videoId);
    }
  }, [job?.status, job?.videoId, setCompletedVideo]);

  if (!activeJobId) {
    navigate('/create');
    return <></>;
  }

  async function handleCancel(): Promise<void> {
    if (activeJobId) await api.cancelJob(activeJobId);
  }

  const ready = job?.status === 'completed' && Boolean(job.videoId);

  const assets = job?.assets ?? [];
  const downloadedCount = assets.filter((use) => use.source === 'downloaded').length;
  const libraryCount = assets.filter((use) => use.source === 'library').length;
  const builtinCount = assets.filter((use) => use.source === 'builtin').length;

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: '#fff' }}>
        {ready ? 'Your Video Is Ready' : 'Rendering Video'}
      </h1>
      <p style={{ color: '#666', marginBottom: 24, fontSize: 13 }}>Job ID: {activeJobId}</p>

      {job ? (
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

          {/* Which artwork each scene took: a newly downloaded file, one already
              in the local library, or the built-in glyph when nothing matched. */}
          {assets.length > 0 ? (
            <section style={{ marginTop: 24 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#e0e0f0', marginBottom: 4 }}>
                Artwork used
              </h2>
              <p style={{ color: '#666', fontSize: 12, marginTop: 0, marginBottom: 12 }}>
                {downloadedCount} downloaded · {libraryCount} from the local library ·{' '}
                {builtinCount} built-in glyph{builtinCount === 1 ? '' : 's'}
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
                        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '3px 0' }}
                      >
                        <span style={{ flex: 1, color: '#e6e6f0' }}>{pick.label}</span>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontSize: 11,
                            color: pick.asset ? '#8f7be0' : '#6a6a85',
                          }}
                        >
                          {pick.asset ?? `built-in glyph (${pick.icon})`}
                        </span>
                        {pick.source === 'downloaded' ? (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: '#4A90D9',
                              border: '1px solid #4A90D9',
                              borderRadius: 4,
                              padding: '1px 5px',
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
            </section>
          ) : null}

          {/* Finished: play the video right here instead of leaving the page. */}
          {ready && job.videoId ? (
            <section style={{ marginTop: 28 }}>
              <div style={{
                padding: '12px 16px', marginBottom: 16, borderRadius: 10,
                backgroundColor: '#2ecc7115', border: '1px solid #2ecc71',
                color: '#2ecc71', fontSize: 13, fontWeight: 700,
              }}>
                ✓ Render complete — the video is ready to watch
              </div>

              <VideoPlayer videoId={job.videoId} poster={api.thumbnailUrl(job.videoId)} />

              <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
                <button
                  onClick={() => { reset(); navigate('/create'); }}
                  style={{ flex: 1, padding: '12px', backgroundColor: '#4A90D9', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700 }}
                >
                  + Create Another
                </button>
                <Link
                  to="/preview"
                  style={{ flex: 1, padding: '12px', backgroundColor: '#1e1e36', color: '#a0a0c0', border: '1px solid #3a3a5a', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none', textAlign: 'center' }}
                >
                  Video details
                </Link>
                <Link
                  to="/history"
                  style={{ flex: 1, padding: '12px', backgroundColor: '#1e1e36', color: '#a0a0c0', border: '1px solid #3a3a5a', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none', textAlign: 'center' }}
                >
                  History
                </Link>
              </div>
            </section>
          ) : null}

          {['pending', 'processing'].includes(job.status) && (
            <button
              onClick={() => void handleCancel()}
              style={{ marginTop: 24, padding: '10px 20px', backgroundColor: '#e74c3c20', color: '#e74c3c', border: '1px solid #e74c3c', borderRadius: 8, fontSize: 13, fontWeight: 600 }}
            >
              Cancel Job
            </button>
          )}
        </>
      ) : (
        <p style={{ color: '#666' }}>Loading job status…</p>
      )}
    </div>
  );
}
