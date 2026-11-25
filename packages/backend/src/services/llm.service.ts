import fs from 'fs';
import { getLlama, LlamaChatSession, type Llama, type LlamaModel, type LlamaContext } from 'node-llama-cpp';
import { config } from '../config.js';
import { resolveModelPath, downloadModel } from './llm.downloader.js';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmChatOptions {
  temperature?: number;
  top_p?: number;
  num_predict?: number;
}

/**
 * Detect a reply that carries no actual language.
 *
 * A GPU kernel that does not match the card, or a broken detokenizer, makes the
 * model emit runs of `?`/U+FFFD. That text is long enough to pass every size
 * check and then becomes a one-word "script" full of `????`, so it has to be
 * rejected on content rather than length.
 */
export function looksUndecodable(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  const lettersOrDigits = (trimmed.match(/[\p{L}\p{N}]/gu) ?? []).length;
  return lettersOrDigits < Math.max(1, Math.ceil(trimmed.length * 0.15));
}

class LlmService {
  private llama: Llama | null = null;
  private model: LlamaModel | null = null;
  private context: LlamaContext | null = null;
  private initialized = false;
  private initializing: Promise<void> | null = null;
  /**
   * A context owns a fixed number of sequences (one by default). Chats are
   * therefore serialized: a second caller waits for the sequence to be
   * released instead of failing with "No sequences left".
   */
  private chatQueue: Promise<unknown> = Promise.resolve();
  /**
   * Set once the GPU path has produced undecodable output. The model is then
   * reloaded on CPU and stays there: a broken kernel does not heal, and a
   * correct (slower) reply beats a fast one made of `?`.
   */
  private gpuDisabled = false;

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;

    this.initializing = this._init().catch((err: unknown) => {
      // Allow a later call to retry a failed load instead of caching the error.
      this.initializing = null;
      throw err;
    });
    await this.initializing;
  }

  private async _init(): Promise<void> {
    const modelPath = resolveModelPath();

    if (!fs.existsSync(modelPath) || fs.statSync(modelPath).size === 0) {
      console.log('[LLM] Model not found — downloading...');
      await downloadModel((p) => {
        if (p.percent % 10 === 0) process.stdout.write(`\r[LLM] Downloading: ${p.percent}%`);
      });
      process.stdout.write('\n');
    }

    console.log(`[LLM] Loading model from ${modelPath}`);

    // `gpu: false` selects the CPU-only build of llama.cpp, so it must only be
    // used when GPU offloading is explicitly disabled. "auto" resolves to CUDA
    // or Vulkan when the driver is usable and falls back to CPU otherwise.
    const useGpu = !this.gpuDisabled && config.localLlm.gpuLayers !== 0;
    const gpuLayers = useGpu ? config.localLlm.gpuLayers : 0;

    if (config.localLlm.buildFromSource && useGpu) {
      console.log(
        '[LLM] Source build enabled — reusing the cached llama.cpp build if one ' +
          'exists (only a first-time build can take up to an hour)...',
      );
    }
    // llama.cpp turns CUDA graphs on for Volta/Turing (ggml-org/llama.cpp#25749),
    // and on sm_75 cards such as the Tesla T4 the captured graph replays stale
    // buffers: the model loads, offloads every layer, and then emits one filler
    // token per step (a run of `?`). Graphs only speed up decoding, so dropping
    // them costs ~10-15% and restores correct logits. An explicit value from the
    // operator wins.
    if (useGpu && process.env['GGML_CUDA_DISABLE_GRAPHS'] === undefined) {
      process.env['GGML_CUDA_DISABLE_GRAPHS'] = '1';
      console.log(
        '[LLM] CUDA graphs disabled (Turing/sm_75 workaround for garbled output; ' +
          'unset GGML_CUDA_DISABLE_GRAPHS to opt back in)',
      );
    }

    this.llama = await getLlama({
      gpu: useGpu ? 'auto' : false,
      // Prebuilt CUDA binaries can require a newer driver than the machine has;
      // building from source targets the installed toolkit and GPU instead.
      ...(config.localLlm.buildFromSource && useGpu ? { usePrebuiltBinaries: false } : {}),
    });

    const deviceNames = await this.llama.getGpuDeviceNames().catch(() => [] as string[]);
    if (this.llama.gpu) {
      console.log(
        `[LLM] GPU backend: ${this.llama.gpu}${deviceNames.length > 0 ? ` (${deviceNames.join(', ')})` : ''}`,
      );
    } else if (this.gpuDisabled) {
      console.log('[LLM] GPU backend: disabled — running on CPU');
    } else {
      console.log('[LLM] GPU backend: none detected — running on CPU');
    }

    this.model = await this.llama.loadModel({
      modelPath,
      gpuLayers,
    });

    console.log(`[LLM] Offloaded layers: ${this.model.gpuLayers}`);

    this.context = await this.model.createContext({
      contextSize: config.localLlm.contextSize,
    });

    this.initialized = true;
    console.log('[LLM] Model loaded and ready');
  }  async chat(messages: LlmMessage[], options?: LlmChatOptions): Promise<string> {
    const run = async (): Promise<string> => {
      const reject = (reply: string): void => {
        console.warn(
          `[LLM] Reply had no letters or digits (${reply.length} chars, ` +
            `start ${JSON.stringify(reply.slice(0, 40))})`,
        );
      };

      const first = await this.runChat(messages, options);
      if (!looksUndecodable(first)) return first;
      reject(first);

      // One greedy retry on the same backend first. A single degenerate stop —
      // an immediate EOS, a sampler hiccup — looks exactly like a broken GPU
      // from here, and reloading on CPU costs minutes of every later call, so
      // the cheap explanation is ruled out before the expensive one.
      const retry = await this.runChat(messages, { ...options, temperature: 0.05 });
      if (!looksUndecodable(retry)) return retry;
      reject(retry);

      // A backend that fails twice is treated as broken: reload on CPU.
      if (this.llama?.gpu && !this.gpuDisabled) {
        await this.reloadOnCpu();
        const cpuReply = await this.runChat(messages, { ...options, temperature: 0.05 });
        if (!looksUndecodable(cpuReply)) return cpuReply;
        console.warn('[LLM] CPU reply was also undecodable');
      }

      throw new Error(
        'LLM produced undecodable text (no letters or digits in the reply). ' +
          'The model file is probably corrupt or its tokenizer does not match ' +
          'node-llama-cpp; delete it so the downloader fetches it again.',
      );
    };

    const chained = this.chatQueue.then(run, run);
    // Keep the chain alive whether the run succeeds or fails.
    this.chatQueue = chained.then(
      () => undefined,
      () => undefined,
    );
    return chained;
  }

  /** Dispose the CUDA model and reload it with no offloaded layers. */
  private async reloadOnCpu(): Promise<void> {
    if (this.gpuDisabled) return;
    this.gpuDisabled = true;
    console.warn(
      '[LLM] CUDA output was undecodable — reloading the model on CPU. ' +
        'Generation will be slower; set LLM_GPU_LAYERS=0 to skip this probe next start.',
    );
    await this.dispose();
    await this.ensureInitialized();
  }

  private async runChat(messages: LlmMessage[], options?: LlmChatOptions): Promise<string> {
    await this.ensureInitialized();

    const context = this.context;
    if (!context) throw new Error('LLM context is not available');

    // Each chat takes one context sequence and must always give it back —
    // otherwise the second request fails with "No sequences left".
    const sequence = context.getSequence();
    // The pool hands the sequence back with the previous chat's tokens still in
    // its KV cache, and LlamaChatSession does not clear them: without this, the
    // next prompt is evaluated on top of a finished conversation. The model then
    // treats it as a continuation and stops at once, producing an empty reply
    // that looks exactly like a broken GPU.
    await sequence.clearHistory();
    const session = new LlamaChatSession({ contextSequence: sequence });

    try {
      const systemMsg = messages.find((m) => m.role === 'system')?.content ?? '';
      const userMessages = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ ...m }));

      // Prepend system prompt to first user message if present
      if (systemMsg && userMessages[0]) {
        userMessages[0] = {
          ...userMessages[0],
          content: `${systemMsg}\n\n${userMessages[0].content}`,
        };
      }

      // CPU generation is several times slower than the GPU path, so the same
      // 3-minute budget would abort a long reply before it finishes.
      const timeoutMs = this.gpuDisabled
        ? config.localLlm.timeoutMs * 4
        : config.localLlm.timeoutMs;
      // Abort the generation itself on timeout, so the sequence is released
      // instead of continuing to generate in the background.
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new Error(`LLM timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );

      let reply = '';
      try {
        for (let i = 0; i < userMessages.length; i++) {
          const msg = userMessages[i];
          if (!msg) continue;

          if (i < userMessages.length - 1) {
            await session.prompt(msg.content, {
              maxTokens: 10,
              temperature: 0.1,
              signal: controller.signal,
              stopOnAbortSignal: true,
            });
          } else {
            reply = await session.prompt(msg.content, {
              maxTokens: options?.num_predict ?? config.localLlm.maxTokens,
              temperature: options?.temperature ?? 0.7,
              topP: options?.top_p ?? 0.9,
              signal: controller.signal,
              stopOnAbortSignal: true,
            });
          }
        }
      } catch (err) {
        if (controller.signal.aborted) {
          throw new Error(`LLM timed out after ${timeoutMs}ms`);
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }

      return reply;
    } finally {
      // Release the sequence ourselves and await it: the context reclaims the
      // slot through an async lock, so the next queued chat must not race it.
      try {
        session.dispose();
      } finally {
        await sequence.dispose();
      }
    }
  }

  isModelAvailable(): boolean {
    try {
      const modelPath = resolveModelPath();
      return fs.existsSync(modelPath) && fs.statSync(modelPath).size > 0;
    } catch {
      return false;
    }
  }

  getModelPath(): string { return resolveModelPath(); }
  getModelName(): string { return config.localLlm.modelName; }

  /**
   * Load the model ahead of the first request. Otherwise the first script
   * generation pays the whole load, which can outlast browser/proxy timeouts.
   */
  async preload(): Promise<void> {
    await this.ensureInitialized();
  }

  async dispose(): Promise<void> {
    if (this.context) await this.context.dispose();
    if (this.model) await this.model.dispose();
    if (this.llama) await this.llama.dispose();
    this.context = null;
    this.model = null;
    this.llama = null;
    this.initialized = false;
    this.initializing = null;
  }
}

export const llmService = new LlmService();
export { llmService as ollamaService };
