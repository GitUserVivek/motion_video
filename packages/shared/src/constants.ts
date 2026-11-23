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

export const INSTRUCTOR_IDS = ['emma', 'james', 'sophie', 'alex'] as const;
export type InstructorId = (typeof INSTRUCTOR_IDS)[number];

export interface InstructorProfile {
  id: InstructorId;
  name: string;
  skin: string;
  skinShade: string;
  hair: string;
  hairStyle: 'bob' | 'short' | 'long' | 'curly';
  blazer: string;
  blazerShade: string;
  shirt: string;
  trousers: string;
  shoes: string;
  accent: string;
  glasses: boolean;
}

/**
 * The presenter library. These are renderer assets, not generated artwork: the
 * same profile is reused for every video that selects the matching voice.
 */
export const INSTRUCTOR_PROFILES: Record<InstructorId, InstructorProfile> = {
  emma: {
    id: 'emma', name: 'Emma', skin: '#F2C6A0', skinShade: '#D9A67E',
    hair: '#5A3522', hairStyle: 'bob', blazer: '#1F6F5B', blazerShade: '#165445',
    shirt: '#F7FAFC', trousers: '#26324A', shoes: '#1B1B24', accent: '#FFD166', glasses: false,
  },
  james: {
    id: 'james', name: 'James', skin: '#8D5524', skinShade: '#6F3F18',
    hair: '#1A1A1A', hairStyle: 'short', blazer: '#244A8F', blazerShade: '#1B396F',
    shirt: '#EAF2FF', trousers: '#1E2538', shoes: '#111827', accent: '#FFB703', glasses: false,
  },
  sophie: {
    id: 'sophie', name: 'Sophie', skin: '#F5D0B5', skinShade: '#E0B090',
    hair: '#3B2416', hairStyle: 'long', blazer: '#7A2E5C', blazerShade: '#5E2147',
    shirt: '#FFF7FB', trousers: '#2B2233', shoes: '#17121C', accent: '#FFD166', glasses: true,
  },
  alex: {
    id: 'alex', name: 'Alex', skin: '#C68642', skinShade: '#A66B2F',
    hair: '#2B2B2B', hairStyle: 'curly', blazer: '#3B3B58', blazerShade: '#2B2B43',
    shirt: '#F2F2F7', trousers: '#242432', shoes: '#141420', accent: '#8F7BE0', glasses: true,
  },
};

const VOICE_INSTRUCTOR: Record<string, InstructorId> = {
  'en-US-female-1': 'emma',
  'en-US-male-1': 'james',
  'en-GB-female-1': 'sophie',
  'espeak-en': 'alex',
  'en-US-AriaNeural': 'emma',
  'en-US-GuyNeural': 'james',
  'en-GB-SoniaNeural': 'sophie',
};

/** Stable voice → presenter mapping, so every video with that voice gets the
 * same saved instructor instead of a new random character. */
export function resolveInstructor(value?: string): InstructorProfile {
  const key = value?.trim() ?? '';
  const direct = VOICE_INSTRUCTOR[key];
  if (direct) return INSTRUCTOR_PROFILES[direct];

  const preset = VOICES[key];
  const spoken = (preset?.voice ?? key).toLowerCase();
  if (/(guy|ryan|george|male|james)/.test(spoken)) return INSTRUCTOR_PROFILES.james;
  if (/(sonia|libby|sophie)/.test(spoken)) return INSTRUCTOR_PROFILES.sophie;
  if (/(aria|emma|jenny|female)/.test(spoken)) return INSTRUCTOR_PROFILES.emma;
  return INSTRUCTOR_PROFILES.alex;
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

/**
 * Colour families the renderer paints scene backgrounds with. They live in shared
 * code as plain ids so the backend can plan a palette per scene without
 * importing the renderer's CSS.
 */
export const PALETTE_IDS = [
  'sky',
  'violet',
  'coral',
  'teal',
  'sunshine',
  'rose',
  'mint',
  'indigo',
] as const;

export type PaletteId = (typeof PALETTE_IDS)[number];

/** Topic → preferred colour families. The first matching entry wins. */
const TOPIC_PALETTES: ReadonlyArray<{ pattern: RegExp; palettes: readonly PaletteId[] }> = [
  {
    pattern: /\b(sound|music|audio|voice|hearing|speaker|speech|noise|echo)\b/i,
    palettes: ['rose', 'violet', 'sky'],
  },
  {
    pattern: /\b(space|planet|rocket|galaxy|star|orbit|moon|astronaut|satellite|universe)\b/i,
    palettes: ['indigo', 'violet', 'sky'],
  },
  {
    pattern: /\b(plant|photosynthes\w*|leaf|leaves|tree|nature|biology|cell|dna|bacteria|animal)\b/i,
    palettes: ['mint', 'teal', 'sunshine'],
  },
  {
    pattern: /\b(heart|blood|body|health|muscle|organ|lung|brain)\b/i,
    palettes: ['coral', 'rose', 'mint'],
  },
  {
    pattern: /\b(computer|cpu|processor|artificial intelligence|\bai\b|code|software|data|internet|network|robot|algorithm)\b/i,
    palettes: ['sky', 'violet', 'teal'],
  },
  {
    pattern: /\b(numbers?|maths?|equations?|fraction|geometry|algebra|calculat\w*|percent\w*)\b/i,
    palettes: ['sunshine', 'coral', 'sky'],
  },
  {
    pattern: /\b(history|war|revolution|ancient|civilization|discovery|explor\w*)\b/i,
    palettes: ['coral', 'sunshine', 'teal'],
  },
];

/** Small deterministic string hash so a topic always starts on the same colour. */
function seedNumber(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100_000;
  }
  return hash;
}

/**
 * Pick the background palette for scene `index`. Topic affinity decides the
 * shortlist, `avoid` (usually the previous scene's palette) keeps two adjacent
 * scenes from sharing an environment.
 */
export function pickScenePalette(
  topic: string,
  index: number,
  avoid?: PaletteId,
): PaletteId {
  const affinity = TOPIC_PALETTES.find((entry) => entry.pattern.test(topic))?.palettes;
  const pool: PaletteId[] = affinity
    ? [...affinity, ...PALETTE_IDS.filter((id) => !affinity.includes(id))]
    : [...PALETTE_IDS];

  const size = pool.length;
  let palette = pool[(seedNumber(topic) + index) % size] ?? 'sky';

  if (avoid && palette === avoid) {
    palette = pool[(pool.indexOf(palette) + 1) % size] ?? 'teal';
  }

  return palette;
}

export const STEP_LABELS: Record<string, string> = {
  pending:            'Waiting in queue',
  generating_audio:   'Generating narration audio',
  aligning_subtitles: 'Aligning subtitles',
  discovering_assets: 'Discovering illustrations',
  planning_storyboard:'Planning storyboard',
  rendering:          'Rendering animation frames',
  muxing:             'Encoding video',
  validating:         'Validating output',
  saving:             'Saving to disk',
  completed:          'Complete',
};
