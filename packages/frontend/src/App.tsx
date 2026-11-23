import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { Dashboard } from './pages/Dashboard.js';
import { CreateInput } from './pages/CreateInput.js';
import { ScriptEditor } from './pages/ScriptEditor.js';
import { VideoConfig } from './pages/VideoConfig.js';
import { RenderProgress } from './pages/RenderProgress.js';
import { VideoPreview } from './pages/VideoPreview.js';
import { History } from './pages/History.js';
import { SettingsPage } from './pages/Settings.js';

function NotFound(): React.ReactElement {
  return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: '#888' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🧭</div>
      <h1 style={{ fontSize: 24, color: '#fff', marginBottom: 8 }}>Page not found</h1>
      <p style={{ fontSize: 13, marginBottom: 20 }}>The page you were looking for does not exist.</p>
      <Link to="/" style={{ color: '#4A90D9', fontWeight: 600 }}>← Back to Dashboard</Link>
    </div>
  );
}

export default function App(): React.ReactElement {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/create" element={<CreateInput />} />
          <Route path="/script" element={<ScriptEditor />} />
          <Route path="/configure" element={<VideoConfig />} />
          <Route path="/render" element={<RenderProgress />} />
          <Route path="/preview" element={<VideoPreview />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
