import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AspectRatio, Settings } from '@edumotion/shared';
import { ASPECT_RATIOS } from '@edumotion/shared';
import { api } from '../api/client.js';
import { ErrorNotice, LoadingState, errorMessage } from '../components/Feedback.js';

export function SettingsPage(): React.ReactElement {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const settingsQuery = useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: api.getSettings,
  });
  const settings = settingsQuery.data;

  // React Query v5 removed the per-query `onSuccess` callback. Sync the form
  // when the settings arrive instead, without refetching or changing the cache.
  useEffect(() => {
    if (!settings) return;
    setForm({
      llm_model_name: settings.llmModelName,
      tts_engine: settings.ttsEngine,
      tts_voice: settings.ttsVoice,
      default_duration: String(settings.defaultDuration),
      default_aspect_ratio: settings.defaultAspectRatio,
      max_concurrent_jobs: String(settings.maxConcurrentJobs),
    });
  }, [settings]);

  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 10000,
  });
  const health = healthQuery.data;

  async function handleSave(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await api.updateSettings(form);
      await qc.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSaveError(errorMessage(e, 'Could not save settings.'));
    } finally {
      setSaving(false);
    }
  }

  if (settingsQuery.isError) {
    return (
      <div style={{ maxWidth: 600 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24, color: '#fff' }}>Settings</h1>
        <ErrorNotice
          message={errorMessage(settingsQuery.error, 'Could not load settings.')}
          onRetry={() => void settingsQuery.refetch()}
        />
      </div>
    );
  }

  if (settingsQuery.isPending || !settings) {
    return (
      <div style={{ maxWidth: 600 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24, color: '#fff' }}>Settings</h1>
        <LoadingState label="Loading settings…" />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24, color: '#fff' }}>Settings</h1>

      <section style={card}>
        <h2 style={sectionTitle}>Service Health</h2>
        {healthQuery.isPending ? (
          <LoadingState label="Checking services…" />
        ) : healthQuery.isError ? (
          <ErrorNotice
            message={errorMessage(healthQuery.error, 'Could not check service health.')}
            onRetry={() => void healthQuery.refetch()}
          />
        ) : health ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(health.services).map(([svc, ok]) => (
              <div key={svc} style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                backgroundColor: ok ? '#2ecc7120' : '#e74c3c20',
                color: ok ? '#2ecc71' : '#e74c3c',
                border: `1px solid ${ok ? '#2ecc71' : '#e74c3c'}`,
              }}>
                {ok ? '✓' : '✗'} {svc}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <form onSubmit={(event) => void handleSave(event)}>
        <section style={card}>
          <h2 style={sectionTitle}>Local LLM</h2>
          <label htmlFor="llm-model" style={labelStyle}>Model Name</label>
          <input
            id="llm-model"
            value={form['llm_model_name'] ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, llm_model_name: e.target.value }))}
            placeholder="qwen2.5-7b-instruct-q4"
            disabled={saving}
            style={{ marginBottom: 8 }}
          />
          <p style={{ fontSize: 12, color: '#555', wordBreak: 'break-word' }}>
            Models directory: <code style={{ color: '#4A90D9' }}>{settings.llmModelsDir}</code>
          </p>
        </section>

        <section style={card}>
          <h2 style={sectionTitle}>Text-to-Speech</h2>
          <label htmlFor="tts-engine" style={labelStyle}>Engine</label>
          <select
            id="tts-engine"
            value={form['tts_engine'] ?? 'edge-tts'}
            onChange={(e) => setForm((f) => ({ ...f, tts_engine: e.target.value }))}
            disabled={saving}
            style={{ marginBottom: 16 }}
          >
            <option value="edge-tts">edge-tts (recommended)</option>
            <option value="espeak">espeak-ng (offline fallback)</option>
          </select>
          <label htmlFor="tts-voice" style={labelStyle}>Voice</label>
          <input
            id="tts-voice"
            value={form['tts_voice'] ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, tts_voice: e.target.value }))}
            placeholder="en-US-AriaNeural"
            disabled={saving}
          />
        </section>

        <section style={card}>
          <h2 style={sectionTitle}>Rendering</h2>
          <label htmlFor="default-duration" style={labelStyle}>Default Duration (seconds)</label>
          <input
            id="default-duration"
            type="number"
            min={10}
            value={form['default_duration'] ?? '40'}
            onChange={(e) => setForm((f) => ({ ...f, default_duration: e.target.value }))}
            disabled={saving}
            style={{ marginBottom: 16 }}
          />
          <label htmlFor="default-aspect" style={labelStyle}>Default Aspect Ratio</label>
          <select
            id="default-aspect"
            value={form['default_aspect_ratio'] ?? '9:16'}
            onChange={(e) => setForm((f) => ({ ...f, default_aspect_ratio: e.target.value as AspectRatio }))}
            disabled={saving}
            style={{ marginBottom: 16 }}
          >
            {(Object.keys(ASPECT_RATIOS) as AspectRatio[]).map((ratio) => (
              <option key={ratio} value={ratio}>{ASPECT_RATIOS[ratio].label}</option>
            ))}
          </select>
          <label htmlFor="max-jobs" style={labelStyle}>Max Concurrent Jobs</label>
          <input
            id="max-jobs"
            type="number"
            min={1}
            value={form['max_concurrent_jobs'] ?? '1'}
            onChange={(e) => setForm((f) => ({ ...f, max_concurrent_jobs: e.target.value }))}
            disabled={saving}
          />
        </section>

        <div style={{ marginBottom: 12, fontSize: 12, color: '#555', wordBreak: 'break-word' }}>
          Output directory: <code style={{ color: '#4A90D9' }}>{settings.outputDir}</code>
        </div>

        {saveError && <ErrorNotice message={saveError} />}

        <button
          type="submit"
          disabled={saving}
          aria-busy={saving}
          style={primaryBtn}
        >
          {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
}

const card: React.CSSProperties = { backgroundColor: '#1e1e36', border: '1px solid #2a2a4a', borderRadius: 12, padding: 24, marginBottom: 16 };
const sectionTitle: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: '#a0a0c0', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, color: '#888', marginBottom: 6, fontWeight: 600 };
const primaryBtn: React.CSSProperties = { width: '100%', padding: '14px', backgroundColor: '#4A90D9', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700 };
