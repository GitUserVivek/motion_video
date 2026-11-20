import type { AspectRatio, AnimationTheme, TtsEngine } from './types/index.js';

export const ASPECT_RATIOS: Record<AspectRatio, { width: number; height: number; label: string }> = {
  '9:16': { width: 1080, height: 1920, label: 'Portrait (9:16)' },
  '16:9': { width: 1920, height: 1080, label: 'Landscape (16:9)' },
  '1:1':  { width: 1080, height: 1080, label: 'Square (1:1)' },
};

export const DEFAULT_FPS = 30;
export const DEFAULT_DURATION = 40;
export const DEFAULT_ASPECT_RATIO: AspectRatio = '9:16';
export const DEFAULT_LANGUAGE = 'en';
export const DEFAULT_ANIMATION_THEME: AnimationTheme = 'educational';

export const DURATION_OPTIONS = [40, 60, 90] as const;

export const ANIMATION_THEMES: AnimationTheme[] = ['modern', 'playful', 'minimal', 'educational'];

export const TTS_ENGINES: TtsEngine[] = ['kokoro', 'edge-tts', 'espeak'];

export const VOICES: Record<string, { label: string; lang: string; engine: TtsEngine; voice: string }> = {
  'en-US-female-1': { label: 'Emma (US Female)', lang: 'en', engine: 'edge-tts', voice: 'en-US-AriaNeural' },
  'en-US-male-1':   { label: 'James (US Male)',  lang: 'en', engine: 'edge-tts', voice: 'en-US-GuyNeural' },
  'en-GB-female-1': { label: 'Sophie (UK Female)', lang: 'en', engine: 'edge-tts', voice: 'en-GB-SoniaNeural' },
  'espeak-en':      { label: 'eSpeak English',   lang: 'en', engine: 'espeak', voice: 'en' },
};

/**
 * Turn the voice picked in the UI into the engine's own voice name. The UI sends
 * preset ids ('en-US-male-1'); edge-tts needs 'en-US-GuyNeural'. A value that is
 * already an engine voice name is passed through unchanged.
 */
export function resolveTtsVoice(value: string | undefined): { voice: string; engine: TtsEngine } {
  const preset = value ? VOICES[value] : undefined;
  if (preset) return { voice: preset.voice, engine: preset.engine };
  const trimmed = value?.trim();
  return { voice: trimmed || 'en-US-AriaNeural', engine: 'edge-tts' };
}

export const LOCAL_LLM_MODEL_NAME = 'qwen3-8b-instruct-q4';
export const LOCAL_LLM_HF_REPO = 'Qwen/Qwen3-8B-GGUF';
export const LOCAL_LLM_HF_FILE = 'qwen3-8b-instruct-q4_k_m.gguf';
export const LOCAL_LLM_CONTEXT_SIZE = 4096;

/** @deprecated — Ollama is no longer used. Kept for reference only. */
export const OLLAMA_DEFAULT_MODEL = 'qwen2.5:7b';
/** @deprecated */
export const OLLAMA_FALLBACK_MODEL = 'llama3.2:3b';
/** @deprecated */
export const OLLAMA_BASE_URL = 'http://localhost:11434';

export const WORDS_PER_SECOND = 2.5; // average narration speed
export const MAX_RETRY_COUNT = 2;
export const JOB_POLL_INTERVAL_MS = 2000;
export const MAX_CONCURRENT_JOBS = 1;

export const COMPONENT_NAMES = [
  'AnimatedText',
  'AnimatedNumber',
  'Character',
  'Teacher',
  'EducationalObject',
  'ObjectGroup',
  'MultiplicationTable',
  'ImageScene',
  'BackgroundScene',
  'Subtitle',
  'QuestionCard',
  'Confetti',
  'EndScreen',
  'ProgressBar',
] as const;

export const STEP_LABELS: Record<string, string> = {
  pending:            'Waiting in queue',
  generating_audio:   'Generating narration audio',
  aligning_subtitles: 'Aligning subtitles',
  planning_storyboard:'Planning storyboard',
  rendering:          'Rendering animation frames',
  muxing:             'Encoding video',
  validating:         'Validating output',
  saving:             'Saving to disk',
  completed:          'Complete',
};
