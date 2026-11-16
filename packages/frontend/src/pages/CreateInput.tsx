import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useProjectStore } from '../store/projectStore.js';

export function CreateInput(): React.ReactElement {
  const navigate = useNavigate();
  const { mode, topic, ownScriptContent, ownScriptMode, setMode, setTopic, setOwnScript, setOwnScriptMode, setScript } = useProjectStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeMode = mode ?? 'topic';

  async function handleSubmit(): Promise<void> {
    setError(null);
    setLoading(true);
    try {
      let script;
      if (activeMode === 'topic') {
        if (!topic.trim()) { setError('Please enter a topic.'); return; }
        script = await api.generateScript(topic.trim());
      } else {
        if (!ownScriptContent.trim()) { setError('Please enter your script.'); return; }
        script = await api.validateScript(ownScriptContent.trim(), ownScriptMode);
      }
      setScript(script);
      navigate('/script');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to process script');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24, color: '#fff' }}>Create Video</h1>

      {/* Mode Toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
        {(['topic', 'own-script'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
              backgroundColor: activeMode === m ? '#4A90D9' : '#1e1e36',
              color: activeMode === m ? '#fff' : '#a0a0c0',
              fontWeight: 600, fontSize: 14,
            }}
          >
            {m === 'topic' ? '💡 Generate from Topic' : '📝 Use My Script'}
          </button>
        ))}
      </div>

      {activeMode === 'topic' ? (
        <div>
          <label style={labelStyle}>Educational Topic</label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. How does photosynthesis work?"
            onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
            style={{ marginBottom: 8 }}
          />
          <p style={{ fontSize: 12, color: '#666', marginBottom: 20 }}>
            AI will generate a 40-second educational script based on this topic.
          </p>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {(['preserve', 'improve'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setOwnScriptMode(m)}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 6, border: 'none',
                  backgroundColor: ownScriptMode === m ? '#4A90D920' : 'transparent',
                  color: ownScriptMode === m ? '#4A90D9' : '#888',
                  fontWeight: 600, fontSize: 13,
                  borderBottom: `2px solid ${ownScriptMode === m ? '#4A90D9' : 'transparent'}`,
                }}
              >
                {m === 'preserve' ? '🔒 Preserve (fix only)' : '✨ Improve (rewrite)'}
              </button>
            ))}
          </div>
          <label style={labelStyle}>Your Narration Script</label>
          <textarea
            value={ownScriptContent}
            onChange={(e) => setOwnScript(e.target.value)}
            rows={10}
            placeholder="Paste your educational script here…"
            style={{ marginBottom: 8, resize: 'vertical' }}
          />
          <p style={{ fontSize: 12, color: '#666', marginBottom: 20 }}>
            {ownScriptContent.split(/\s+/).filter(Boolean).length} words
          </p>
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', backgroundColor: '#e74c3c20', border: '1px solid #e74c3c', borderRadius: 8, color: '#e74c3c', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <button
        onClick={() => void handleSubmit()}
        disabled={loading}
        style={primaryBtn}
      >
        {loading ? '⏳ Processing…' : activeMode === 'topic' ? '✨ Generate Script' : '→ Continue'}
      </button>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: '#a0a0c0', marginBottom: 6, fontWeight: 600 };
const primaryBtn: React.CSSProperties = { width: '100%', padding: '14px', backgroundColor: '#4A90D9', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700 };
