import path from 'path';
import os from 'os';

const ROOT_DIR = path.resolve(__dirname, '../../..');

export const config = {
  port: parseInt(process.env['PORT'] ?? '3001', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',

  ollama: {
    baseUrl: process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434',
    model: process.env['OLLAMA_MODEL'] ?? 'qwen2.5:7b',
    fallbackModel: process.env['OLLAMA_FALLBACK_MODEL'] ?? 'llama3.2:3b',
    timeoutMs: parseInt(process.env['OLLAMA_TIMEOUT_MS'] ?? '120000', 10),
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
