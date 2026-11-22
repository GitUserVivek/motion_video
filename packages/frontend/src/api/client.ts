import type {
  ApiResponse,
  HealthStatus,
  ScriptResponse,
  JobResponse,
  JobAssetsResponse,
  VideoListItem,
  Settings,
  VideoConfig,
} from '@edumotion/shared';

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success || !res.ok) {
    throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  }
  return json.data as T;
}

export const api = {
  health: (): Promise<HealthStatus> => request('/health'),

  generateScript: (topic: string, duration?: number): Promise<ScriptResponse> =>
    request('/scripts/generate', {
      method: 'POST',
      body: JSON.stringify({ topic, config: { duration: duration ?? 40 } }),
    }),

  validateScript: (content: string, mode: 'preserve' | 'improve'): Promise<ScriptResponse> =>
    request('/scripts/validate', {
      method: 'POST',
      body: JSON.stringify({ content, mode }),
    }),

  rewriteScript: (scriptId: string, mode: 'improve' | 'preserve'): Promise<ScriptResponse> =>
    request('/scripts/rewrite', {
      method: 'POST',
      body: JSON.stringify({ scriptId, mode }),
    }),

  approveScript: (scriptId: string, content: string): Promise<void> =>
    request('/scripts/approve', {
      method: 'POST',
      body: JSON.stringify({ scriptId, content }),
    }),

  generateVideo: (scriptId: string, config: VideoConfig): Promise<JobResponse> =>
    request('/videos/generate', {
      method: 'POST',
      body: JSON.stringify({ scriptId, config }),
    }),

  getJob: (jobId: string): Promise<JobResponse> => request(`/jobs/${jobId}`),

  /** The artwork report changes at most once per job, so callers fetch it once. */
  getJobAssets: (jobId: string): Promise<JobAssetsResponse> =>
    request(`/jobs/${jobId}/assets`),

  listJobs: (): Promise<JobResponse[]> => request('/jobs'),

  cancelJob: (jobId: string): Promise<void> =>
    request(`/jobs/${jobId}/cancel`, { method: 'POST' }),

  resumeJob: (jobId: string): Promise<void> =>
    request(`/jobs/${jobId}/resume`, { method: 'POST' }),

  listVideos: (): Promise<VideoListItem[]> => request('/videos'),

  deleteVideo: (videoId: string): Promise<void> =>
    request(`/videos/${videoId}`, { method: 'DELETE' }),

  getSettings: (): Promise<Settings> => request('/settings'),

  updateSettings: (updates: Record<string, string>): Promise<void> =>
    request('/settings', { method: 'PATCH', body: JSON.stringify(updates) }),

  downloadUrl: (videoId: string): string => `${BASE}/videos/${videoId}/download`,
  streamUrl: (videoId: string): string => `${BASE}/videos/${videoId}/stream`,
  thumbnailUrl: (videoId: string): string => `${BASE}/videos/${videoId}/thumbnail`,
};
