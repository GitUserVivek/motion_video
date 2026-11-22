// Script modes
export type ScriptMode = 'topic' | 'own-script';
export type ScriptStatus = 'draft' | 'approved' | 'rejected';
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type AspectRatio = '9:16' | '16:9' | '1:1';
export type AnimationTheme = 'modern' | 'playful' | 'minimal' | 'educational';
export type TtsEngine = 'kokoro' | 'edge-tts' | 'espeak';

// Re-export from schemas to avoid duplication
export type {
  ComponentName,
  SubtitleEntry,
  StoryboardPlan,
  SceneChild,
  SceneInstruction,
} from '../schemas/storyboard.schema.js';

export type {
  ContentAnalysis,
  ContentClaim,
  ContentClaimKind,
  ContentClaimStatus,
  ContentKeyTerm,
  ResearchSource,
} from '../schemas/content.schema.js';

export interface Project {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Script {
  id: string;
  projectId: string;
  mode: ScriptMode;
  content: string;
  status: ScriptStatus;
  createdAt: string;
}

export interface VideoConfig {
  duration: 40 | 60 | 90 | number;
  aspectRatio: AspectRatio;
  language: string;
  voice: string;
  animationTheme: AnimationTheme;
  subtitles: boolean;
  backgroundMusic: boolean;
  fps: number;
  width: number;
  height: number;
}

export interface Job {
  id: string;
  projectId: string;
  status: JobStatus;
  progress: number;
  currentStep: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  retryCount: number;
}

export interface Video {
  id: string;
  jobId: string;
  filePath: string;
  downloadUrl: string;
  durationSeconds: number;
  sizeBytes: number;
  thumbnailPath: string | null;
  createdAt: string;
}

export interface Settings {
  llmModelName: string;
  llmModelsDir: string;
  ttsEngine: TtsEngine;
  ttsVoice: string;
  outputDir: string;
  maxConcurrentJobs: number;
  defaultDuration: number;
  defaultAspectRatio: AspectRatio;
}

// API request/response types
export interface GenerateScriptRequest {
  topic: string;
  config: Partial<VideoConfig>;
}

export interface OwnScriptRequest {
  content: string;
  mode: 'preserve' | 'improve';
  config: Partial<VideoConfig>;
}

export interface ScriptResponse {
  scriptId: string;
  content: string;
  wordCount: number;
  estimatedDurationSeconds: number;
}

export interface GenerateVideoRequest {
  scriptId: string;
  config: VideoConfig;
}

/** One diagram tile of one scene and the artwork it ended up with. */
export interface SceneAssetUsage {
  sceneIndex: number;
  label: string;
  icon: string;
  /** Library-relative file, e.g. `auto/heart-1a2b3c4d.svg`; null = built-in glyph. */
  asset: string | null;
  source: 'downloaded' | 'library' | 'builtin';
  /** Same-origin URL that renders the file, so the UI can show a preview. */
  previewUrl?: string;
}

export interface JobAssetsResponse {
  /** Artwork each scene picked, with a preview URL per file. */
  assets: SceneAssetUsage[];
}

export interface JobResponse {
  jobId: string;
  status: JobStatus;
  progress: number;
  currentStep: string;
  error: string | null;
  videoId?: string;
  /** Scenes rendered so far — only meaningful while `currentStep` is `rendering`. */
  scenesCompleted?: number;
  scenesTotal?: number;
  /**
   * True once the artwork report exists. The report itself is fetched once from
   * `/api/jobs/:id/assets`, so the 2-second job poll stays small.
   */
  assetsAvailable?: boolean;
}

export interface VideoListItem {
  id: string;
  jobId: string;
  title: string;
  durationSeconds: number;
  sizeBytes: number;
  createdAt: string;
  downloadUrl: string;
  thumbnailUrl: string | null;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  services: {
    database: boolean;
    llm: boolean;
    tts: boolean;
    ffmpeg: boolean;
    renderer: boolean;
    /** @deprecated use llm */
    ollama?: boolean;
  };
  version: string;
  uptime: number;
}
