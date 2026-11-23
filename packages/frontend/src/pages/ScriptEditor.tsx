import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useProjectStore } from '../store/projectStore.js';
import { ErrorNotice, errorMessage } from '../components/Feedback.js';

export function ScriptEditor(): React.ReactElement {
  const navigate = useNavigate();
  const { script, updateScriptContent, setScript } = useProjectStore();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!script) return <Navigate to="/create" replace />;

  const wordCount = script.content.split(/\s+/).filter(Boolean).length;
  const estDuration = (wordCount / 2.5).toFixed(0);
  const canApprove = script.content.trim().length > 0 && !loading;

  async function handleRegenerate(mode: 'improve' | 'preserve'): Promise<void> {
    setError(null);
    setLoading('rewriting');
    try {
      const updated = await api.rewriteScript(script!.scriptId, mode);
      setScript(updated);
    } catch (e) {
      setError(errorMessage(e, 'Rewrite failed'));
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
      setError(errorMessage(e, 'Approval failed'));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4, color: '#fff' }}>Review Script</h1>
          <p style={{ color: '#666', fontSize: 13 }}>Edit the script below, then approve it to continue.</p>
        </div>
        <Link to="/create" style={{ fontSize: 13, color: '#a0a0c0', whiteSpace: 'nowrap' }}>← Start over</Link>
      </div>

      <label htmlFor="script-content" className="sr-only">Narration script</label>
      <textarea
        id="script-content"
        value={script.content}
        onChange={(e) => updateScriptContent(e.target.value)}
        rows={16}
        disabled={!!loading}
        style={{ marginBottom: 8, resize: 'vertical', lineHeight: 1.7, fontSize: 15 }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666', marginBottom: 20 }}>
        <span>{wordCount} words</span>
        <span>~{estDuration}s estimated</span>
      </div>

      {error && <ErrorNotice message={error} />}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => void handleRegenerate('preserve')}
          disabled={!!loading}
          style={{ ...secondaryBtn, flex: '1 1 130px' }}
        >
          {loading === 'rewriting' ? '⏳' : '🔧'} Fix Grammar
        </button>
        <button
          type="button"
          onClick={() => void handleRegenerate('improve')}
          disabled={!!loading}
          style={{ ...secondaryBtn, flex: '1 1 130px' }}
        >
          {loading === 'rewriting' ? '⏳' : '✨'} Improve
        </button>
        <button
          type="button"
          onClick={() => void handleApprove()}
          disabled={!canApprove}
          aria-busy={loading === 'approving'}
          style={{ ...primaryBtn, flex: '2 1 220px' }}
        >
          {loading === 'approving' ? '⏳ Approving…' : '✅ Approve & Continue'}
        </button>
      </div>

      {!script.content.trim() && (
        <p style={{ color: '#c9a227', fontSize: 12, marginTop: 12 }}>
          Add some narration before approving the script.
        </p>
      )}
    </div>
  );
}

const primaryBtn: React.CSSProperties = { padding: '12px', backgroundColor: '#4A90D9', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700 };
const secondaryBtn: React.CSSProperties = { padding: '12px', backgroundColor: '#1e1e36', color: '#a0a0c0', border: '1px solid #3a3a5a', borderRadius: 8, fontSize: 14, fontWeight: 600 };
