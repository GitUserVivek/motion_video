import path from 'path';
import os from 'os';

// Project root = packages/backend/../../.. = repo root
const ROOT_DIR = path.resolve(__dirname, '../../..');

// Models live one level above the project root: <parent>/models/<model_name>/
const MODELS_DIR = process.env['MODELS_DIR'] ?? path.resolve(ROOT_DIR, '..', 'models');

export const config = {
  port: parseInt(process.env['PORT'] ?? '3001', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',

  localLlm: {
    // Directory that contains model sub-folders: <MODELS_DIR>/<modelName>/<file>.gguf
    modelsDir: MODELS_DIR,
    // Sub-folder name inside modelsDir (also used as the HuggingFace repo slug default)
    modelName: process.env['LLM_MODEL_NAME'] ?? 'qwen2.5-7b-instruct-q4',
    // Explicit filename override; if omitted the downloader uses hfFile
    modelFile: process.env['LLM_MODEL_FILE'] ?? '',
    // HuggingFace repo to download from (owner/repo)
    hfRepo: process.env['LLM_HF_REPO'] ?? 'bartowski/Qwen2.5-7B-Instruct-GGUF',
    // Which GGUF file inside that repo to fetch
    hfFile: process.env['LLM_HF_FILE'] ?? 'Qwen2.5-7B-Instruct-Q4_K_M.gguf',
    // Context window size (tokens)
    contextSize: parseInt(process.env['LLM_CONTEXT_SIZE'] ?? '4096', 10),
    // GPU layers to offload (-1 = auto-detect, 0 = CPU only)
    gpuLayers: parseInt(process.env['LLM_GPU_LAYERS'] ?? '0', 10),
    // Max tokens to generate per request
    maxTokens: parseInt(process.env['LLM_MAX_TOKENS'] ?? '2048', 10),
    // Generation timeout in ms
    timeoutMs: parseInt(process.env['LLM_TIMEOUT_MS'] ?? '180000', 10),
  },

  db: {
    path: process.env['DB_PATH'] ?? path.join(ROOT_DIR, 'data', 'edumotion.db'),
  },

  storage: {
    rootDir: ROOT_DIR,
    outputDir: path.join(ROOT_DIR, 'output'),
    videosDir: path.join(ROOT_DIR, 'output', 'videos'),
    audioDir: path.join(ROOT_DIR, 'output', 'audio'),
    subtitlesDir: path.join(ROOT_DIR, 'output', 'subtitles'),
    thumbnailsDir: path.join(ROOT_DIR, 'output', 'thumbnails'),
    tempDir: path.join(ROOT_DIR, 'temp'),
    assetsDir: path.join(ROOT_DIR, 'assets'),
    dataDir: path.join(ROOT_DIR, 'data'),
  },

  tts: {
    engine: (process.env['TTS_ENGINE'] ?? 'edge-tts') as 'kokoro' | 'edge-tts' | 'espeak',
    voice: process.env['TTS_VOICE'] ?? 'en-US-AriaNeural',
  },

  render: {
    fps: parseInt(process.env['RENDER_FPS'] ?? '30', 10),
    maxConcurrentJobs: parseInt(process.env['MAX_CONCURRENT_JOBS'] ?? '1', 10),
    maxRetryCount: parseInt(process.env['MAX_RETRY_COUNT'] ?? '2', 10),
  },

  system: {
    totalRamGB: Math.round(os.totalmem() / 1024 / 1024 / 1024),
    cpuCount: os.cpus().length,
  },
} as const;

export type Config = typeof config;
