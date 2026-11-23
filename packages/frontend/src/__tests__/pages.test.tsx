import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from '../pages/Dashboard.js';

vi.mock('../api/client.js', () => ({
  api: {
    health: vi.fn().mockResolvedValue({
      status: 'ok',
      services: { database: true, ollama: true, ffmpeg: true, tts: false, renderer: true },
      version: '1.0.0',
      uptime: 100,
    }),
    listVideos: vi.fn().mockResolvedValue([]),
    listJobs: vi.fn().mockResolvedValue([]),
  },
}));

function TestWrapper({ children }: { children: React.ReactNode }): React.ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

describe('Dashboard', () => {
  it('renders without crashing', () => {
    render(<TestWrapper><Dashboard /></TestWrapper>);
    expect(screen.getByText(/EduMotion AI/i)).toBeTruthy();
  });

  it('shows quick start section', () => {
    render(<TestWrapper><Dashboard /></TestWrapper>);
    expect(screen.getByText(/From Topic/i)).toBeTruthy();
  });
});
