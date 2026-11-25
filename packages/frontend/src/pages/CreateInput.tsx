import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LANGUAGES, defaultVoiceFor } from '@edumotion/shared';
import { api } from '../api/client.js';
import { useProjectStore } from '../store/projectStore.js';
import { ErrorNotice, errorMessage } from '../components/Feedback.js';

export function CreateInput(): React.ReactElement {
  const navigate = useNavigate();
  const {
    mode, topic, ownScriptContent, ownScriptMode, videoConfig,
    setMode, setTopic, setOwnScript, setOwnScriptMode, setScript, setVideoConfig,
  } = useProjectStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeMode = mode ?? 'topic';
  const language = LANGUAGES.find((entry) => entry.code === videoConfig.language) ?? LANGUAGES[0];
  const marathi = language.code === 'mr';
  const ownWordCount = ownScriptContent.trim()
    ? ownScriptContent.split(/\s+/).filter(Boolean).length
    : 0;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (loading) return;

    if (activeMode === 'topic' && !topic.trim()) {
      setError('Please enter a topic.');
      return;
    }
    if (activeMode === 'own-script' && !ownScriptContent.trim()) {
      setError('Please enter your script.');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      let script;
      if (activeMode === 'topic') {
        script = await api.generateScript(topic.trim(), videoConfig.duration, language.code);
      } else {
        script = await api.validateScript(ownScriptContent.trim(), ownScriptMode, language.code);
      }
      setScript(script);
      navigate('/script');
    } catch (e) {
      setError(errorMessage(e, 'Failed to process script'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: '#fff' }}>Create Video</h1>
      <p style={{ color: '#666', marginBottom: 24, fontSize: 13 }}>
        Start from a topic or bring your own narration script.
      </p>

      <form onSubmit={(event) => void handleSubmit(event)}>
        {/* Language */}
        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Video Language</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {LANGUAGES.map((entry) => (
              <button
                key={entry.code}
                type="button"
                onClick={() => setVideoConfig({
                  language: entry.code,
                  // The voice has to be able to speak the script; an English
                  // voice reading Marathi produces gibberish audio.
                  voice: defaultVoiceFor(entry.code),
                })}
                disabled={loading}
                aria-pressed={language.code === entry.code}
                style={{
                  flex: '1 1 140px', padding: '10px 12px', borderRadius: 8,
                  border: `1px solid ${language.code === entry.code ? '#4A90D9' : '#3a3a5a'}`,
                  backgroundColor: language.code === entry.code ? '#4A90D920' : '#1e1e36',
                  color: language.code === entry.code ? '#4A90D9' : '#a0a0c0',
                  fontWeight: 700, fontSize: 14,
                }}
              >
                {entry.nativeLabel}
                {entry.code === 'mr' ? ' · Marathi' : ''}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 12, color: '#666', marginTop: 8, marginBottom: 0 }}>
            Script, narration and on-screen text will all be in {language.nativeLabel}.
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="mode-toggle" style={{ marginBottom: 28 }}>
          {(['topic', 'own-script'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={activeMode === m}
              style={{
                padding: '10px 12px', borderRadius: 8, border: 'none',
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
            <label htmlFor="video-topic" style={labelStyle}>Educational Topic</label>
            <input
              id="video-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={marathi
                ? 'उदा. प्रकाशसंश्लेषण कसे होते?'
                : 'e.g. How does photosynthesis work?'}
              disabled={loading}
              style={{ marginBottom: 8 }}
            />
            <p style={{ fontSize: 12, color: '#666', marginBottom: 20 }}>
              AI will write a {videoConfig.duration}-second {language.nativeLabel} educational script based on this topic.
            </p>
          </div>
        ) : (
          <div>
            <div className="mode-toggle" style={{ marginBottom: 12 }}>
              {(['preserve', 'improve'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setOwnScriptMode(m)}
                  aria-pressed={ownScriptMode === m}
                  style={{
                    padding: '8px 0', borderRadius: 6, border: 'none',
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
            <label htmlFor="own-script" style={labelStyle}>Your Narration Script</label>
            <textarea
              id="own-script"
              value={ownScriptContent}
              onChange={(e) => setOwnScript(e.target.value)}
              rows={10}
              placeholder={marathi
                ? 'तुमची मराठी स्क्रिप्ट येथे पेस्ट करा…'
                : 'Paste your educational script here…'}
              disabled={loading}
              style={{ marginBottom: 8, resize: 'vertical' }}
            />
            <p style={{ fontSize: 12, color: '#666', marginBottom: 20 }}>
              {ownWordCount} {ownWordCount === 1 ? 'word' : 'words'}
            </p>
          </div>
        )}

        {error && <ErrorNotice message={error} />}

        <button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          style={primaryBtn}
        >
          {loading
            ? '⏳ Processing…'
            : activeMode === 'topic'
              ? '✨ Generate Script'
              : '→ Continue'}
        </button>

        {loading && (
          <p style={{ color: '#666', fontSize: 12, textAlign: 'center', marginTop: 10 }}>
            This can take a little while while the local model writes and checks the script.
          </p>
        )}
      </form>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: '#a0a0c0', marginBottom: 6, fontWeight: 600 };
const primaryBtn: React.CSSProperties = { width: '100%', padding: '14px', backgroundColor: '#4A90D9', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700 };
