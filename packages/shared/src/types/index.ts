// Script modes
export type ScriptMode = 'topic' | 'own-script';
export type ScriptStatus = 'draft' | 'approved' | 'rejected';
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type AspectRatio = '9:16' | '16:9' | '1:1';
export type AnimationTheme = 'modern' | 'playful' | 'minimal' | 'educational';
export type TtsEngine = 'kokoro' | 'edge-tts' | 'espeak';

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

export interface SubtitleEntry {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

export interface SceneChild {
  component: ComponentName;
  props: Record<string, unknown>;
}

export type ComponentName =
  | 'AnimatedText'
  | 'AnimatedNumber'
  | 'Character'
  | 'Teacher'
  | 'EducationalObject'
  | 'ObjectGroup'
  | 'MultiplicationTable'
  | 'ImageScene'
  | 'BackgroundScene'
  | 'Subtitle'
  | 'QuestionCard'
  | 'Confetti'
  | 'EndScreen'
  | 'ProgressBar';

export interface SceneInstruction {
  id: string;
  startFrame: number;
  endFrame: number;
  component: ComponentName;
  props: Record<string, unknown>;
  children?: SceneChild[];
}

export interface StoryboardPlan {
  jobId: string;
  totalFrames: number;
  fps: number;
  audioDurationMs: number;
  scenes: SceneInstruction[];
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
