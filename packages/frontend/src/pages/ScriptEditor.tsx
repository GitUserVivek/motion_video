import React, { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import type { ScriptAsset, ScriptAssetUpload } from '@edumotion/shared';
import { api } from '../api/client.js';
import { useProjectStore } from '../store/projectStore.js';
import { ErrorNotice, errorMessage } from '../components/Feedback.js';

const MAX_SCRIPT_ASSETS = 6;
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

/**
 * Compress in the browser before upload. The server accepts a bounded base64
 * JSON payload, so the user's full-resolution camera photo never has to cross
 * the wire.
 */
async function prepareImage(file: File): Promise<ScriptAssetUpload> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error(`${file.name}: use PNG, JPEG, or WebP images.`);
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error(`${file.name}: image is larger than 15 MB.`);
  }

  const bitmap = await createImageBitmap(file);
  try {
    const maxDimension = 1280;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error(`${file.name}: could not prepare the image.`);
    context.drawImage(bitmap, 0, 0, width, height);

    let dataUrl = canvas.toDataURL('image/webp', 0.82);
    let mimeType: ScriptAssetUpload['mimeType'] = 'image/webp';
    if (!dataUrl.startsWith('data:image/webp')) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      mimeType = 'image/jpeg';
    }
    return { name: file.name, mimeType, dataUrl, width, height };
  } finally {
    bitmap.close();
  }
}

export function ScriptEditor(): React.ReactElement {
  const navigate = useNavigate();
  const { script, updateScriptContent, setScript } = useProjectStore();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assets, setAssets] = useState<ScriptAsset[]>([]);
  const [assetBusy, setAssetBusy] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);

  useEffect(() => {
    if (!script) return;
    let cancelled = false;
    setAssets([]);
    setAssetError(null);
    void api.listScriptAssets(script.scriptId)
      .then((next) => {
        if (!cancelled) setAssets(next);
      })
      .catch((e) => {
        if (!cancelled) setAssetError(errorMessage(e, 'Could not load uploaded images.'));
      });
    return () => { cancelled = true; };
  }, [script?.scriptId]);

  if (!script) return <Navigate to="/create" replace />;

  const wordCount = script.content.split(/\s+/).filter(Boolean).length;
  const estDuration = (wordCount / 2.5).toFixed(0);
  const canApprove = script.content.trim().length > 0 && !loading && !assetBusy;

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

  async function handleAssetFiles(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    if (assets.length + files.length > MAX_SCRIPT_ASSETS) {
      setAssetError(`You can attach up to ${MAX_SCRIPT_ASSETS} images.`);
      return;
    }

    setAssetBusy(true);
    setAssetError(null);
    try {
      const uploads: ScriptAssetUpload[] = [];
      for (const file of files) uploads.push(await prepareImage(file));
      const next = await api.uploadScriptAssets(script.scriptId, uploads);
      setAssets(next);
    } catch (e) {
      setAssetError(errorMessage(e, 'Image upload failed.'));
    } finally {
      setAssetBusy(false);
    }
  }

  async function handleRemoveAsset(assetId: string): Promise<void> {
    setAssetBusy(true);
    setAssetError(null);
    try {
      await api.deleteScriptAsset(script.scriptId, assetId);
      setAssets((current) => current.filter((asset) => asset.id !== assetId));
    } catch (e) {
      setAssetError(errorMessage(e, 'Could not remove that image.'));
    } finally {
      setAssetBusy(false);
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

      <section style={assetCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#e0e0f0', marginBottom: 4 }}>
              Your images <span style={{ color: '#666', fontWeight: 500 }}>(optional)</span>
            </h2>
            <p style={{ color: '#8f8faa', fontSize: 12, lineHeight: 1.6, margin: 0 }}>
              Add PNG, JPEG, or WebP images you want the video to use. Multiple images are supported.
              They will only appear in scenes where their content matches; they are analyzed once when the
              storyboard is planned.
            </p>
          </div>
          <label
            htmlFor="script-assets"
            style={{
              ...assetAddButton,
              opacity: assetBusy || assets.length >= MAX_SCRIPT_ASSETS ? 0.55 : 1,
              pointerEvents: assetBusy || assets.length >= MAX_SCRIPT_ASSETS ? 'none' : 'auto',
            }}
          >
            {assetBusy ? '⏳ Uploading…' : '+ Add images'}
          </label>
          <input
            id="script-assets"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(event) => void handleAssetFiles(event)}
            disabled={assetBusy || assets.length >= MAX_SCRIPT_ASSETS}
            style={{ display: 'none' }}
          />
        </div>

        {assetError && <p style={{ color: '#e74c3c', fontSize: 12, marginBottom: 0 }}>{assetError}</p>}

        {assets.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))', gap: 10, marginTop: 14 }}>
            {assets.map((asset) => (
              <div key={asset.id} style={assetTile}>
                <img
                  src={asset.previewUrl}
                  alt={asset.caption ?? asset.fileName}
                  style={{ width: '100%', height: 84, objectFit: 'cover', borderRadius: 7, backgroundColor: '#0f0f1e' }}
                />
                <div style={{ padding: '7px 2px 2px' }}>
                  <div style={{ color: '#d8d8e8', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={asset.fileName}>
                    {asset.fileName}
                  </div>
                  {asset.caption && asset.caption !== asset.fileName ? (
                    <div style={{ color: '#77778f', fontSize: 10, lineHeight: 1.3, marginTop: 2, maxHeight: 26, overflow: 'hidden' }}>
                      {asset.caption}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void handleRemoveAsset(asset.id)}
                    disabled={assetBusy}
                    style={removeButton}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#666', fontSize: 12, margin: '12px 0 0' }}>
            No optional images added. The automatic artwork library will be used.
          </p>
        )}
      </section>

      {error && <ErrorNotice message={error} />}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => void handleRegenerate('preserve')}
          disabled={!!loading || assetBusy}
          style={{ ...secondaryBtn, flex: '1 1 130px' }}
        >
          {loading === 'rewriting' ? '⏳' : '🔧'} Fix Grammar
        </button>
        <button
          type="button"
          onClick={() => void handleRegenerate('improve')}
          disabled={!!loading || assetBusy}
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
const assetCard: React.CSSProperties = { backgroundColor: '#16162a', border: '1px solid #2a2a44', borderRadius: 12, padding: 16, marginBottom: 20 };
const assetAddButton: React.CSSProperties = { padding: '9px 12px', borderRadius: 8, backgroundColor: '#4A90D920', color: '#8fb4ff', border: '1px solid #4A90D9', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer' };
const assetTile: React.CSSProperties = { padding: 6, borderRadius: 9, backgroundColor: '#0f0f1e', border: '1px solid #2a2a44' };
const removeButton: React.CSSProperties = { marginTop: 4, padding: 0, border: 'none', background: 'transparent', color: '#e07a7a', fontSize: 10, cursor: 'pointer' };
