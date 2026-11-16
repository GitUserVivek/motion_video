import { create } from 'zustand';
import type { VideoConfig, ScriptResponse } from '@edumotion/shared';
import { DEFAULT_FPS, DEFAULT_DURATION, DEFAULT_ASPECT_RATIO, ASPECT_RATIOS } from '@edumotion/shared';

interface ProjectState {
  // Script step
  mode: 'topic' | 'own-script' | null;
  topic: string;
  ownScriptContent: string;
  ownScriptMode: 'preserve' | 'improve';
  script: ScriptResponse | null;

  // Config step
  videoConfig: VideoConfig;

  // Job step
  activeJobId: string | null;
  completedVideoId: string | null;

  // Actions
  setMode: (mode: 'topic' | 'own-script') => void;
  setTopic: (topic: string) => void;
  setOwnScript: (content: string) => void;
  setOwnScriptMode: (mode: 'preserve' | 'improve') => void;
  setScript: (script: ScriptResponse) => void;
  updateScriptContent: (content: string) => void;
  setVideoConfig: (config: Partial<VideoConfig>) => void;
  setActiveJob: (jobId: string) => void;
  setCompletedVideo: (videoId: string) => void;
  reset: () => void;
}

const defaultConfig: VideoConfig = {
  duration: DEFAULT_DURATION,
  aspectRatio: DEFAULT_ASPECT_RATIO,
  language: 'en',
  voice: 'en-US-AriaNeural',
  animationTheme: 'educational',
  subtitles: true,
  backgroundMusic: false,
  fps: DEFAULT_FPS,
  width: ASPECT_RATIOS[DEFAULT_ASPECT_RATIO].width,
  height: ASPECT_RATIOS[DEFAULT_ASPECT_RATIO].height,
};

export const useProjectStore = create<ProjectState>((set) => ({
  mode: null,
  topic: '',
  ownScriptContent: '',
  ownScriptMode: 'preserve',
  script: null,
  videoConfig: defaultConfig,
  activeJobId: null,
  completedVideoId: null,

  setMode: (mode) => set({ mode }),
  setTopic: (topic) => set({ topic }),
  setOwnScript: (content) => set({ ownScriptContent: content }),
  setOwnScriptMode: (mode) => set({ ownScriptMode: mode }),
  setScript: (script) => set({ script }),
  updateScriptContent: (content) =>
    set((s) => ({ script: s.script ? { ...s.script, content } : s.script })),
  setVideoConfig: (partial) =>
    set((s) => {
      const merged = { ...s.videoConfig, ...partial };
      // Keep width/height in sync with aspect ratio
      if (partial.aspectRatio) {
        const dims = ASPECT_RATIOS[partial.aspectRatio];
        merged.width = dims.width;
        merged.height = dims.height;
      }
      return { videoConfig: merged };
    }),
  setActiveJob: (jobId) => set({ activeJobId: jobId }),
  setCompletedVideo: (videoId) => set({ completedVideoId: videoId }),
  reset: () =>
    set({
      mode: null,
      topic: '',
      ownScriptContent: '',
      script: null,
      activeJobId: null,
      completedVideoId: null,
    }),
}));
