import { spawn as nodeSpawn, type ChildProcess } from 'child_process';
import { config } from '../config.js';

/**
 * Keeps the artwork verifier's own server alive.
 *
 * The vision model is not loaded in-process: `node-llama-cpp` has no image
 * input, so the pictures are judged by an OpenAI-compatible vision endpoint
 * (Ollama by default). That endpoint is a separate process, and leaving it to
 * the operator meant a forgotten `ollama serve` silently downgraded artwork
 * verification to file names.
 *
 * This supervisor makes the backend own that process for the `ollama` provider:
 * on launch it health-checks the endpoint, starts `ollama serve` when nothing is
 * listening, waits for it, and pulls the configured model once if it is missing.
 * A hosted endpoint is only recorded as external — nothing to start there.
 *
 * It never throws and never blocks startup: a failure logs the exact command to
 * run and artwork falls back to the deterministic rules.
 */

export type VisionState = 'off' | 'external' | 'starting' | 'ready' | 'failed';

export interface VisionStatus {
  state: VisionState;
  detail: string;
}

export interface SupervisorOptions {
  provider: string;
  apiUrl: string;
  model: string;
  /** The ollama executable; an absolute path works when it is not on PATH. */
  bin: string;
  /** Start `ollama serve` when nothing answers at apiUrl. */
  autostart: boolean;
  /** How long to wait for the server to accept requests after spawning it. */
  startTimeoutMs: number;
  /** How long `ollama pull` may take before it is abandoned. */
  pullTimeoutMs: number;
  /** Test seams. */
  fetchImpl?: typeof fetch;
  spawnImpl?: typeof nodeSpawn;
  sleep?: (ms: number) => Promise<void>;
}

/** `http://127.0.0.1:11434/v1` → `http://127.0.0.1:11434` (Ollama's native API). */
export function ollamaBaseUrl(apiUrl: string): string | null {
  if (!apiUrl) return null;
  try {
    const url = new URL(apiUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/** OLLAMA_HOST wants `host:port`, not a URL. */
export function ollamaHost(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    const port = url.port || (url.protocol === 'https:' ? '443' : '80');
    return `${url.hostname}:${port}`;
  } catch {
    return '127.0.0.1:11434';
  }
}

/** Whether `/api/tags` lists the configured model (Ollama reports `name:tag`). */
export function hasModel(tags: unknown, model: string): boolean {
  const list = (tags as { models?: Array<{ name?: unknown }> } | null)?.models;
  if (!Array.isArray(list) || !model.trim()) return false;
  const wanted = model.trim().toLowerCase();
  return list.some((entry) => {
    const name = typeof entry?.name === 'string' ? entry.name.toLowerCase() : '';
    return name === wanted || name.startsWith(`${wanted}:`);
  });
}

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class VisionSupervisor {
  private state: VisionState = 'off';
  private detail = '';
  private child: ChildProcess | null = null;
  private spawnError: string | null = null;
  private attempt: Promise<boolean> | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly spawnImpl: typeof nodeSpawn;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: SupervisorOptions) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.spawnImpl = options.spawnImpl ?? nodeSpawn;
    this.sleep = options.sleep ?? realSleep;
  }

  status(): VisionStatus {
    return { state: this.state, detail: this.detail };
  }

  /** Idempotent: the first call does the work, later calls reuse its result. */
  ensure(): Promise<boolean> {
    if (!this.attempt) this.attempt = this.start();
    return this.attempt;
  }

  /** Stop a server this process started (an already-running one is left alone). */
  stop(): void {
    if (!this.child) return;
    try {
      this.child.kill('SIGTERM');
    } catch {
      // Already gone.
    }
    this.child = null;
    if (this.state === 'ready') {
      this.state = 'off';
      this.detail = '';
    }
  }

  private async start(): Promise<boolean> {
    const { provider, apiUrl, model } = this.options;
    if (!apiUrl || !model) {
      this.set('off', 'VISION_API_URL/VISION_MODEL not set; art is accepted on file names');
      return false;
    }

    // A hosted endpoint is somebody else's process: nothing to start, and
    // probing it at boot would only log a warning for a service that is fine.
    if (provider !== 'ollama') {
      this.set('external', `${provider || 'external'}: ${apiUrl} (${model})`);
      return true;
    }

    const base = ollamaBaseUrl(apiUrl);
    if (!base) {
      this.set('failed', `VISION_API_URL is not a URL: "${apiUrl}"`);
      return false;
    }

    this.set('starting', base);
    const running = (await this.tags(base)) !== null;

    if (!running) {
      if (!this.options.autostart) {
        this.set(
          'failed',
          `nothing is listening at ${base} and VISION_AUTOSTART is off — run: ollama serve`,
        );
        return false;
      }
      this.startServer(base);
      if (!(await this.waitForServer(base))) {
        const reason = this.spawnError
          ? `could not run "${this.options.bin}" (${this.spawnError}) — ` +
            'install Ollama or set VISION_OLLAMA_BIN to its full path'
          : `ollama did not answer at ${base} within ${this.options.startTimeoutMs} ms — ` +
            'start it manually with: ollama serve';
        this.set('failed', reason);
        return false;
      }
    }

    if (!(await this.ensureModel(base, model))) {
      this.set(
        'failed',
        `model "${model}" is not available — run: ollama pull ${model}`,
      );
      return false;
    }

    this.set('ready', `${base} (${model})`);
    return true;
  }

  private startServer(base: string): void {
    const host = ollamaHost(base);
    this.spawnError = null;
    try {
      const child = this.spawnImpl(this.options.bin, ['serve'], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, OLLAMA_HOST: host },
      });
      this.child = child;
      child.unref?.();
      // A missing binary is reported as an async 'error' event, not a throw.
      // Without this listener Node kills the whole backend on ENOENT.
      child.once('error', (err: Error) => {
        this.spawnError = err.message;
        this.child = null;
        console.warn(`[Vision] Could not start "${this.options.bin}": ${err.message}`);
      });
      // The detached server must not outlive the backend it was started for.
      const kill = (): void => {
        try {
          child.kill('SIGTERM');
        } catch {
          // Already gone.
        }
      };
      process.once('exit', kill);
      process.once('SIGINT', kill);
      process.once('SIGTERM', kill);
      console.log(`[Vision] Started "${this.options.bin} serve" for ${host}`);
    } catch (err) {
      this.child = null;
      this.spawnError = err instanceof Error ? err.message : String(err);
      console.warn('[Vision] Could not start ollama: ' + this.spawnError);
    }
  }

  /** Poll `/api/tags` until the spawned server accepts requests. */
  private async waitForServer(base: string): Promise<boolean> {
    const deadline = Date.now() + this.options.startTimeoutMs;
    while (Date.now() < deadline) {
      // No point polling a server whose process never started.
      if (this.spawnError) return false;
      if ((await this.tags(base)) !== null) return true;
      await this.sleep(500);
    }
    return false;
  }

  /**
   * Pull the configured model once when the server does not have it, then give
   * a freshly started server a moment to publish its model list before giving
   * up — a just-spawned Ollama reports an empty `/api/tags` for a few seconds.
   */
  private async ensureModel(base: string, model: string): Promise<boolean> {
    if (this.spawnError) return false;
    if (await this.waitForModel(base, model, 8000)) {
      console.log(`[Vision] Ollama ready at ${base} with ${model}`);
      return true;
    }

    console.log(`[Vision] Pulling ${model} (one-time download, this can take minutes)`);
    const pulled = await this.pull(base, model);
    if (!pulled.ok) {
      console.warn(`[Vision] ollama pull ${model} failed: ${pulled.error}`);
      return false;
    }

    if (!(await this.waitForModel(base, model, 15000))) {
      console.warn(`[Vision] ${model} is still not listed by Ollama after pulling it`);
      return false;
    }
    console.log(`[Vision] Ollama ready at ${base} with ${model}`);
    return true;
  }

  private async waitForModel(base: string, model: string, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const tags = await this.tags(base);
      if (hasModel(tags, model)) return true;
      await this.sleep(500);
    }
    return false;
  }

  /** Run `ollama pull`, reporting the CLI's own error instead of a bare false. */
  private pull(base: string, model: string): Promise<{ ok: boolean; error: string }> {
    return new Promise((resolve) => {
      let child: ChildProcess;
      try {
        child = this.spawnImpl(this.options.bin, ['pull', model], {
          stdio: ['ignore', 'ignore', 'pipe'],
          env: { ...process.env, OLLAMA_HOST: ollamaHost(base) },
        });
      } catch (err) {
        resolve({ ok: false, error: err instanceof Error ? err.message : String(err) });
        return;
      }

      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-500);
      });

      const finish = (ok: boolean, error: string): void => {
        clearTimeout(timer);
        resolve({ ok, error });
      };

      const timer = setTimeout(() => {
        console.warn(`[Vision] ollama pull ${model} timed out after ${this.options.pullTimeoutMs} ms`);
        try {
          child.kill('SIGTERM');
        } catch {
          // Already gone.
        }
        finish(false, 'timed out');
      }, this.options.pullTimeoutMs);

      child.once('error', (err) => finish(false, err.message));
      child.once('exit', (code) => {
        const error = stderr.replace(/\s+/g, ' ').trim();
        finish(code === 0, error || `exit code ${code ?? 'unknown'}`);
      });
    });
  }

  /** `/api/tags` payload, or null when nothing answers. */
  private async tags(base: string): Promise<unknown | null> {
    try {
      const response = await this.fetchImpl(`${base}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  private set(state: VisionState, detail: string): void {
    this.state = state;
    this.detail = detail;
  }
}

export const visionSupervisor = new VisionSupervisor({
      provider: config.vision.provider,
    apiUrl: config.vision.apiUrl,
    model: config.vision.model,
    bin: config.vision.bin,
  autostart: config.vision.autostart,
  startTimeoutMs: config.vision.startTimeoutMs,
  pullTimeoutMs: config.vision.pullTimeoutMs,
});

/** Startup hook: resolves to whether the artwork verifier can call a model. */
export function ensureVisionReady(): Promise<boolean> {
  return visionSupervisor.ensure();
}
