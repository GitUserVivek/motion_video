import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useProjectStore } from '../store/projectStore.js';

export function ScriptEditor(): React.ReactElement {
  const navigate = useNavigate();
  const { script, updateScriptContent, setScript } = useProjectStore();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!script) {
    navigate('/create');
    return <></>;
  }

  const wordCount = script.content.split(/\s+/).filter(Boolean).length;
  const estDuration = (wordCount / 2.5).toFixed(0);

  async function handleRegenerate(mode: 'improve' | 'preserve'): Promise<void> {
    setError(null);
    setLoading('rewriting');
    try {
      const updated = await api.rewriteScript(script!.scriptId, mode);
      setScript(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rewrite failed');
    } finally {
      setLoading(null);
    }
  }

  async function handleApprove(): Promise<void> {
    setError(null);
    setLoading('approving');
    try {
      await api.approveScript(script!.scriptId, script!.content);
      navigate('/configure');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approval failed');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4, color: '#fff' }}>Review Script</h1>
      <p style={{ color: '#666', marginBottom: 24, fontSize: 13 }}>Edit the script below, then approve it to continue.</p>

      <textarea
        value={script.content}
        onChange={(e) => updateScriptContent(e.target.value)}
        rows={16}
        style={{ marginBottom: 8, resize: 'vertical', lineHeight: 1.7, fontSize: 15 }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666', marginBottom: 20 }}>
        <span>{wordCount} words</span>
        <span>~{estDuration}s estimated</span>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', backgroundColor: '#e74c3c20', border: '1px solid #e74c3c', borderRadius: 8, color: '#e74c3c', fontSize: 13, marginBottom: 16 }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => void handleRegenerate('preserve')}
          disabled={!!loading}
          style={{ ...secondaryBtn, flex: 1 }}
        >
          {loading === 'rewriting' ? '⏳' : '🔧'} Fix Grammar
        </button>
        <button
          onClick={() => void handleRegenerate('improve')}
          disabled={!!loading}
          style={{ ...secondaryBtn, flex: 1 }}
        >
          {loading === 'rewriting' ? '⏳' : '✨'} Improve
        </button>
        <button
          onClick={() => void handleApprove()}
          disabled={!!loading}
          style={{ ...primaryBtn, flex: 2 }}
        >
          {loading === 'approving' ? '⏳ Approving…' : '✅ Approve & Continue'}
        </button>
      </div>
    </div>
  );
}

const primaryBtn: React.CSSProperties = { padding: '12px', backgroundColor: '#4A90D9', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700 };
const secondaryBtn: React.CSSProperties = { padding: '12px', backgroundColor: '#1e1e36', color: '#a0a0c0', border: '1px solid #3a3a5a', borderRadius: 8, fontSize: 14, fontWeight: 600 };
