"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STEP_LABELS = exports.COMPONENT_NAMES = exports.MAX_CONCURRENT_JOBS = exports.JOB_POLL_INTERVAL_MS = exports.MAX_RETRY_COUNT = exports.WORDS_PER_SECOND = exports.OLLAMA_BASE_URL = exports.OLLAMA_FALLBACK_MODEL = exports.OLLAMA_DEFAULT_MODEL = exports.LOCAL_LLM_CONTEXT_SIZE = exports.LOCAL_LLM_HF_FILE = exports.LOCAL_LLM_HF_REPO = exports.LOCAL_LLM_MODEL_NAME = exports.VOICES = exports.TTS_ENGINES = exports.ANIMATION_THEMES = exports.DURATION_OPTIONS = exports.DEFAULT_ANIMATION_THEME = exports.DEFAULT_LANGUAGE = exports.DEFAULT_ASPECT_RATIO = exports.DEFAULT_DURATION = exports.DEFAULT_FPS = exports.ASPECT_RATIOS = void 0;
exports.resolveTtsVoice = resolveTtsVoice;
exports.ASPECT_RATIOS = {
    '9:16': { width: 1080, height: 1920, label: 'Portrait (9:16)' },
    '16:9': { width: 1920, height: 1080, label: 'Landscape (16:9)' },
    '1:1': { width: 1080, height: 1080, label: 'Square (1:1)' },
};
exports.DEFAULT_FPS = 30;
exports.DEFAULT_DURATION = 40;
exports.DEFAULT_ASPECT_RATIO = '9:16';
exports.DEFAULT_LANGUAGE = 'en';
exports.DEFAULT_ANIMATION_THEME = 'educational';
exports.DURATION_OPTIONS = [40, 60, 90];
exports.ANIMATION_THEMES = ['modern', 'playful', 'minimal', 'educational'];
exports.TTS_ENGINES = ['kokoro', 'edge-tts', 'espeak'];
exports.VOICES = {
    'en-US-female-1': { label: 'Emma (US Female)', lang: 'en', engine: 'edge-tts', voice: 'en-US-AriaNeural' },
    'en-US-male-1': { label: 'James (US Male)', lang: 'en', engine: 'edge-tts', voice: 'en-US-GuyNeural' },
    'en-GB-female-1': { label: 'Sophie (UK Female)', lang: 'en', engine: 'edge-tts', voice: 'en-GB-SoniaNeural' },
    'espeak-en': { label: 'eSpeak English', lang: 'en', engine: 'espeak', voice: 'en' },
};
/**
 * Turn the voice picked in the UI into the engine's own voice name. The UI sends
 * preset ids ('en-US-male-1'); edge-tts needs 'en-US-GuyNeural'. A value that is
 * already an engine voice name is passed through unchanged.
 */
function resolveTtsVoice(value) {
    const preset = value ? exports.VOICES[value] : undefined;
    if (preset)
        return { voice: preset.voice, engine: preset.engine };
    const trimmed = value?.trim();
    return { voice: trimmed || 'en-US-AriaNeural', engine: 'edge-tts' };
}
exports.LOCAL_LLM_MODEL_NAME = 'qwen2.5-7b-instruct-q4';
exports.LOCAL_LLM_HF_REPO = 'bartowski/Qwen2.5-7B-Instruct-GGUF';
exports.LOCAL_LLM_HF_FILE = 'Qwen2.5-7B-Instruct-Q4_K_M.gguf';
exports.LOCAL_LLM_CONTEXT_SIZE = 4096;
/** @deprecated — Ollama is no longer used. Kept for reference only. */
exports.OLLAMA_DEFAULT_MODEL = 'qwen2.5:7b';
/** @deprecated */
exports.OLLAMA_FALLBACK_MODEL = 'llama3.2:3b';
/** @deprecated */
exports.OLLAMA_BASE_URL = 'http://localhost:11434';
exports.WORDS_PER_SECOND = 2.5; // average narration speed
exports.MAX_RETRY_COUNT = 2;
exports.JOB_POLL_INTERVAL_MS = 2000;
exports.MAX_CONCURRENT_JOBS = 1;
exports.COMPONENT_NAMES = [
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
];
exports.STEP_LABELS = {
    pending: 'Waiting in queue',
    generating_audio: 'Generating narration audio',
    aligning_subtitles: 'Aligning subtitles',
    planning_storyboard: 'Planning storyboard',
    rendering: 'Rendering animation frames',
    muxing: 'Encoding video',
    validating: 'Validating output',
    saving: 'Saving to disk',
    completed: 'Complete',
};
