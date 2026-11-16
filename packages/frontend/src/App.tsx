import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { Dashboard } from './pages/Dashboard.js';
import { CreateInput } from './pages/CreateInput.js';
import { ScriptEditor } from './pages/ScriptEditor.js';
import { VideoConfig } from './pages/VideoConfig.js';
import { RenderProgress } from './pages/RenderProgress.js';
import { VideoPreview } from './pages/VideoPreview.js';
import { History } from './pages/History.js';
import { SettingsPage } from './pages/Settings.js';

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
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
