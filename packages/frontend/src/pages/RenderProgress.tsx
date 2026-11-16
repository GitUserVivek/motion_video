import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useProjectStore } from '../store/projectStore.js';
import { ProgressTracker } from '../components/ProgressTracker.js';
import { STEP_LABELS } from '@edumotion/shared';

const STEPS = [
  'generating_audio',
  'aligning_subtitles',
  'planning_storyboard',
  'rendering',
  'muxing',
  'validating',
  'saving',
  'completed',
];

export function RenderProgress(): React.ReactElement {
  const navigate = useNavigate();
  const { activeJobId, setCompletedVideo } = useProjectStore();

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

  useEffect(() => {
    if (job?.status === 'completed' && job.videoId) {
      setCompletedVideo(job.videoId);
      setTimeout(() => navigate('/preview'), 500);
    }
  }, [job?.status, job?.videoId, navigate, setCompletedVideo]);

  if (!activeJobId) {
    navigate('/create');
    return <></>;
  }

  async function handleCancel(): Promise<void> {
    if (activeJobId) await api.cancelJob(activeJobId);
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: '#fff' }}>Rendering Video</h1>
      <p style={{ color: '#666', marginBottom: 32, fontSize: 13 }}>Job ID: {activeJobId}</p>

      {job ? (
        <>
          <ProgressTracker
            progress={job.progress}
            currentStep={job.currentStep}
            status={job.status}
            error={job.error}
          />

          {/* Step list */}
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                </div>
              );
            })}
          </div>

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
