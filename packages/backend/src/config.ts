import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root = packages/backend/../../.. = repo root
const ROOT_DIR = path.resolve(__dirname, '../../..');

// Models live one level above the project root: <parent>/models/<model_name>/
const MODELS_DIR = process.env['MODELS_DIR'] ?? path.resolve(ROOT_DIR, '..', 'models');

/** Chromium OpenGL backends Remotion accepts for `--gl`. */
export type RenderGl = 'angle' | 'egl' | 'swiftshader' | 'swangle' | 'vulkan' | 'angle-egl';

export const VALID_RENDER_GL: readonly RenderGl[] = [
  'angle',
  'egl',
  'swiftshader',
  'swangle',
  'vulkan',
  'angle-egl',
];

/**
 * RENDER_GL opts the renderer into a specific Chromium GL backend. Unset means
 * "let Chrome decide" (Remotion's default); the value is validated up front so
 * a typo fails loudly here instead of quietly rendering on the software path.
 */
function parseRenderGl(raw: string | undefined): RenderGl | null {
  const value = raw?.trim().toLowerCase();
  if (!value || value === 'null' || value === 'default' || value === 'none') return null;
  const match = VALID_RENDER_GL.find((candidate) => candidate === value);
  if (!match) {
    console.warn(
      `[Config] Ignoring RENDER_GL="${raw}": expected one of ${VALID_RENDER_GL.join(', ')}`,
    );
    return null;
  }
  return match;
}

export type GpuLayers = 'auto' | 'max' | number;

/**
 * LLM_GPU_LAYERS accepts "auto"/-1 (offload what fits), "max" (offload all
 * layers) or a concrete layer count. 0 disables the GPU entirely.
 */
function parseGpuLayers(raw: string | undefined): GpuLayers {
  const value = (raw ?? 'auto').trim().toLowerCase();
  if (value === '' || value === 'auto' || value === '-1') return 'auto';
  if (value === 'max') return 'max';
  const layers = parseInt(value, 10);
  return Number.isFinite(layers) && layers >= 0 ? layers : 'auto';
}

export const config = {
  port: parseInt(process.env['PORT'] ?? '3001', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',

  localLlm: {
    // Directory that contains model sub-folders: <MODELS_DIR>/<modelName>/<file>.gguf
    modelsDir: MODELS_DIR,
    // Sub-folder name inside modelsDir (also used as the HuggingFace repo slug default)
    modelName: process.env['LLM_MODEL_NAME'] ?? 'qwen3-8b-instruct-q4',
    // Explicit filename override; if omitted the downloader uses hfFile
    modelFile: process.env['LLM_MODEL_FILE'] ?? '',
    // HuggingFace repo to download from (owner/repo)
    hfRepo: process.env['LLM_HF_REPO'] ?? 'Qwen/Qwen3-8B-GGUF',
    // Which GGUF file inside that repo to fetch
    hfFile: process.env['LLM_HF_FILE'] ?? 'qwen3-8b-instruct-q4_k_m.gguf',
    // Context window size (tokens)
    contextSize: parseInt(process.env['LLM_CONTEXT_SIZE'] ?? '4096', 10),
    // GPU layers to offload ('auto'/max = offload what fits, 0 = CPU only)
    gpuLayers: parseGpuLayers(process.env['LLM_GPU_LAYERS']),
    // Compile llama.cpp with the local CUDA toolkit instead of downloading the
    // prebuilt binary. Needed when the prebuilt PTX is newer than the installed
    // NVIDIA driver (CUDA aborts with "unsupported toolchain"). Cached after
    // the first build.
    buildFromSource: /^(1|true|yes)$/i.test(
      process.env['LLM_BUILD_FROM_SOURCE'] ?? '',
    ),
    // Max tokens to generate per request
    maxTokens: parseInt(process.env['LLM_MAX_TOKENS'] ?? '2048', 10),
    // Generation timeout in ms
    timeoutMs: parseInt(process.env['LLM_TIMEOUT_MS'] ?? '180000', 10),
  },

  storage: {
    rootDir: ROOT_DIR,
    // Every job gets its own folder here: output/<jobId>/{video.mp4,audio.wav,…}.
    // See services/job.files.ts for the layout.
    outputDir: path.join(ROOT_DIR, 'output'),
    tempDir: path.join(ROOT_DIR, 'temp'),
    assetsDir: path.join(ROOT_DIR, 'assets'),
    // Optional artwork pack (SVG/PNG/JPG/WebP/GIF). Everything found here is
    // matched to a scene's concepts by file name and inlined into the props.
    resourcesDir: path.join(ROOT_DIR, 'resources'),
    dataDir: path.join(ROOT_DIR, 'data'),
  },

  tts: {
    engine: (process.env['TTS_ENGINE'] ?? 'edge-tts') as 'kokoro' | 'edge-tts' | 'espeak',
    voice: process.env['TTS_VOICE'] ?? 'en-US-AriaNeural',
  },

  assets: {
    // Automatic discovery only ever *adds* files to the local artwork library.
    // A provider being down must never stop a video from rendering, so every
    // failure is logged and the built-in SVG glyphs take over.
    discoveryEnabled: !/^(0|false|no|off)$/i.test(process.env['ASSET_DISCOVERY'] ?? ''),
    providers: (process.env['ASSET_PROVIDERS'] ?? 'iconify,openmoji,wikimedia')
      .split(',')
      .map((provider) => provider.trim().toLowerCase())
      .filter((provider) => provider.length > 0),
    // Downloaded artwork lands inside the existing artwork folder, so the same
    // matcher that indexes `resources/` picks it up with no extra wiring.
    autoAssetsDir: path.join(ROOT_DIR, 'resources', 'auto'),
    cacheDir: path.join(ROOT_DIR, 'data', 'assets'),
    manifestPath: path.join(ROOT_DIR, 'data', 'assets', 'manifest.json'),
    searchCachePath: path.join(ROOT_DIR, 'data', 'assets', 'search-cache.json'),
    creditsPath: path.join(ROOT_DIR, 'resources', 'auto', 'CREDITS.txt'),
    maxQueriesPerJob: Math.max(
      1,
      parseInt(process.env['ASSET_MAX_QUERIES'] ?? '5', 10) || 5,
    ),
    timeoutMs: Math.max(1000, parseInt(process.env['ASSET_TIMEOUT_MS'] ?? '8000', 10) || 8000),
    // A tile is small; anything bigger only bloats the inlined props JSON.
    maxSvgBytes: 400 * 1024,
    maxRasterBytes: 900 * 1024,
  },

  render: {
    fps: parseInt(process.env['RENDER_FPS'] ?? '30', 10),
    // auto | cpu | gpu | dual-gpu. Auto picks based on detected hardware.
    profile: process.env['RENDER_PROFILE'] ?? 'auto',
    // Parallel frame renders. Remotion defaults to half the CPU cores, which
    // leaves most of a 4-vCPU box idle while a 40s video takes minutes.
    concurrency: Math.max(
      1,
      parseInt(
        process.env['RENDER_CONCURRENCY'] ?? String(Math.min(os.cpus().length, 8)),
        10,
      ) || 1,
    ),
    // Chromium's GL backend. 'angle'/'angle-egl' can use a real GPU; leaving it
    // unset lets Chrome pick (software SwiftShader on most headless boxes).
    gl: parseRenderGl(process.env['RENDER_GL']),
    maxConcurrentJobs: parseInt(process.env['MAX_CONCURRENT_JOBS'] ?? '1', 10),
    maxRetryCount: parseInt(process.env['MAX_RETRY_COUNT'] ?? '2', 10),
  },

  system: {
    totalRamGB: Math.round(os.totalmem() / 1024 / 1024 / 1024),
    cpuCount: os.cpus().length,
  },
} as const;

export type Config = typeof config;
