import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';

export function SettingsPage(): React.ReactElement {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
    onSuccess: (data) => {
      setForm({
        llm_model_name: data.llmModelName,
        tts_engine: data.ttsEngine,
        tts_voice: data.ttsVoice,
        default_duration: String(data.defaultDuration),
        max_concurrent_jobs: String(data.maxConcurrentJobs),
      });
    },
  });

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 10000,
  });

  async function handleSave(): Promise<void> {
    setSaving(true);
    try {
      await api.updateSettings(form);
      await qc.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <p style={{ color: '#666' }}>Loading…</p>;

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24, color: '#fff' }}>Settings</h1>

      <section style={card}>
        <h2 style={sectionTitle}>Service Health</h2>
        {health && (
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
        )}
      </section>

      <section style={card}>
        <h2 style={sectionTitle}>Local LLM</h2>
        <label style={labelStyle}>Model Name</label>
        <input
          value={form['llm_model_name'] ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, llm_model_name: e.target.value }))}
          placeholder="qwen2.5-7b-instruct-q4"
          style={{ marginBottom: 8 }}
        />
        <p style={{ fontSize: 12, color: '#555' }}>Models directory: <code style={{ color: '#4A90D9' }}>{settings.llmModelsDir}</code></p>
      </section>

      <section style={card}>
        <h2 style={sectionTitle}>Text-to-Speech</h2>
        <label style={labelStyle}>Engine</label>
        <select
          value={form['tts_engine'] ?? 'edge-tts'}
          onChange={(e) => setForm((f) => ({ ...f, tts_engine: e.target.value }))}
          style={{ marginBottom: 16 }}
        >
          <option value="edge-tts">edge-tts (recommended)</option>
          <option value="espeak">espeak-ng (offline fallback)</option>
        </select>
        <label style={labelStyle}>Voice</label>
        <input
          value={form['tts_voice'] ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, tts_voice: e.target.value }))}
          placeholder="en-US-AriaNeural"
        />
      </section>

      <section style={card}>
        <h2 style={sectionTitle}>Rendering</h2>
        <label style={labelStyle}>Default Duration (seconds)</label>
        <input
          type="number"
          value={form['default_duration'] ?? '40'}
          onChange={(e) => setForm((f) => ({ ...f, default_duration: e.target.value }))}
          style={{ marginBottom: 16 }}
        />
        <label style={labelStyle}>Max Concurrent Jobs</label>
        <input
          type="number"
          value={form['max_concurrent_jobs'] ?? '1'}
          onChange={(e) => setForm((f) => ({ ...f, max_concurrent_jobs: e.target.value }))}
        />
      </section>

      <div style={{ marginBottom: 12, fontSize: 12, color: '#555' }}>
        Output directory: <code style={{ color: '#4A90D9' }}>{settings.outputDir}</code>
      </div>

      <button onClick={() => void handleSave()} disabled={saving} style={primaryBtn}>
        {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Settings'}
      </button>
    </div>
  );
}

const card: React.CSSProperties = { backgroundColor: '#1e1e36', border: '1px solid #2a2a4a', borderRadius: 12, padding: 24, marginBottom: 16 };
const sectionTitle: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: '#a0a0c0', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, color: '#888', marginBottom: 6, fontWeight: 600 };
const primaryBtn: React.CSSProperties = { width: '100%', padding: '14px', backgroundColor: '#4A90D9', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700 };
