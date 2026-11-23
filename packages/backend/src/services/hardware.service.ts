import os from 'os';
import { execSync } from 'child_process';
import { config, type RenderGl } from '../config.js';

export interface GpuInfo {
  index: number;
  name: string;
  memoryMB: number;
}

export interface HardwareInfo {
  cpuCores: number;
  totalRamGB: number;
  gpus: GpuInfo[];
  nvencAvailable: boolean;
  glBackend: 'angle-egl' | 'egl' | null;
}

export type RenderProfile = 'cpu' | 'gpu' | 'dual-gpu';

export interface RenderSettings {
  profile: RenderProfile;
  gl: RenderGl | null;
  concurrency: number;
  useNvenc: boolean;
  gpuIndices: number[];
  chunkCount: number;
}

/** Parse `nvidia-smi --query-gpu=...` CSV output. Pure, testable. */
export function parseNvidiaSmi(output: string): GpuInfo[] {
  const gpus: GpuInfo[] = [];
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(',').map((part) => part.trim());
    if (parts.length < 3) continue;
    const index = Number(parts[0]);
    const name = parts[1];
    const memoryMB = Number((parts[2] ?? '').replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(index) || !name) continue;
    gpus.push({ index, name, memoryMB: Number.isFinite(memoryMB) ? memoryMB : 0 });
  }
  return gpus;
}

/** Detect available GPUs. Never throws. */
export function detectGpus(): GpuInfo[] {
  try {
    const output = execSync(
      'nvidia-smi --query-gpu=index,name,memory.total --format=csv,noheader,nounits',
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 },
    );
    return parseNvidiaSmi(output);
  } catch {
    return [];
  }
}

/** Detect whether FFmpeg can encode with NVENC. Never throws. */
export function detectNvenc(): boolean {
  try {
    const output = execSync('ffmpeg -hide_banner -encoders', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10000,
    });
    return /h264_nvenc/.test(output);
  } catch {
    return false;
  }
}

export function detectHardware(): HardwareInfo {
  const gpus = detectGpus();
  const nvencAvailable = detectNvenc();
  const hasGpu = gpus.length > 0;
  return {
    cpuCores: os.cpus().length,
    totalRamGB: Math.round(os.totalmem() / 1024 / 1024 / 1024),
    gpus,
    nvencAvailable,
    glBackend: hasGpu ? 'angle-egl' : null,
  };
}

/**
 * Choose GL backend. angle-egl is the Chromium backend that can talk to a
 * real NVIDIA GPU through EGL; swiftshader is the safe software fallback.
 */
export function chooseGlBackend(hw: HardwareInfo, profile: RenderProfile): 'angle-egl' | 'egl' | 'swiftshader' | null {
  if (profile === 'cpu') return null;
  if (hw.gpus.length === 0) return null;
  return hw.glBackend ?? 'angle-egl';
}

/**
 * Pure profile selection so it can be unit tested without touching hardware.
 */
export function selectProfile(
  hw: HardwareInfo,
  requested: string,
  envDual: boolean,
): RenderProfile {
  const normalized = requested.trim().toLowerCase();
  if (normalized === 'cpu') return 'cpu';
  if (normalized === 'gpu') return 'gpu';
  if (normalized === 'dual-gpu' || normalized === 'dual') return 'dual-gpu';
  if (normalized === 'auto' || normalized === '') {
    if (envDual && hw.gpus.length >= 2) return 'dual-gpu';
    if (hw.gpus.length >= 1) return 'gpu';
    return 'cpu';
  }
  // Unknown value: be safe.
  return hw.gpus.length >= 1 ? 'gpu' : 'cpu';
}

export function recommendSettings(
  hw: HardwareInfo = detectHardware(),
  requestedProfile: string = process.env['RENDER_PROFILE'] ?? 'auto',
): RenderSettings {
  const envDual = /^(1|true|yes)$/i.test(process.env['RENDER_DUAL_GPU'] ?? '');
  const profile = selectProfile(hw, requestedProfile, envDual);

  const cpu = Math.max(1, hw.cpuCores);
  // Environment overrides win: an operator who measured a box knows it better
  // than the generic core-count heuristic.
  const envConcurrency = Number.parseInt(process.env['RENDER_CONCURRENCY'] ?? '', 10);
  const baseConcurrency = Number.isFinite(envConcurrency) && envConcurrency > 0
    ? Math.max(1, envConcurrency)
    // Keep one core free for the OS/worker and avoid oversubscribing Chrome.
    : Math.max(1, Math.min(cpu, profile === 'dual-gpu' ? Math.floor(cpu / 2) : cpu));

  const chunkCount = profile === 'dual-gpu' && hw.gpus.length >= 2 ? 2 : 1;
  const gpuIndices = profile === 'dual-gpu' && hw.gpus.length >= 2
    ? [0, 1]
    : hw.gpus.length >= 1
      ? [0]
      : [];

  const nvencOverride = process.env['RENDER_NVENC'];
  const useNvenc =
    nvencOverride === undefined
      ? hw.nvencAvailable && profile !== 'cpu'
      : /^(1|true|yes)$/i.test(nvencOverride);

  // RENDER_GL is validated in config; when set it must beat hardware detection.
  const gl = config.render.gl ?? chooseGlBackend(hw, profile);

  if (profile === 'gpu' && hw.gpus.length >= 2) {
    // Evidence, not an error: the second GPU is idle while chunking is off.
    console.log(
      `[Render] ${hw.gpus.length} GPU(s) detected but profile=gpu uses chunkCount=1 ` +
        `— the second GPU stays idle. Set RENDER_PROFILE=dual-gpu to chunk.`,
    );
  }

  return {
    profile,
    gl,
    concurrency: baseConcurrency,
    useNvenc: useNvenc && detectNvenc(),
    gpuIndices,
    chunkCount,
  };
}