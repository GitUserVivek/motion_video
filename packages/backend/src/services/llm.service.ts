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
    if (config.localLlm.buildFromSource && config.localLlm.gpuLayers !== 0) {
      console.log(
        '[LLM] Source build enabled — reusing the cached llama.cpp build if one ' +
          'exists (only a first-time build can take up to an hour)...',
      );
    }
    this.llama = await getLlama({
      gpu: config.localLlm.gpuLayers === 0 ? false : 'auto',
      // Prebuilt CUDA binaries can require a newer driver than the machine has;
      // building from source targets the installed toolkit and GPU instead.
      ...(config.localLlm.buildFromSource ? { usePrebuiltBinaries: false } : {}),
    });

    const deviceNames = await this.llama.getGpuDeviceNames().catch(() => [] as string[]);
    if (this.llama.gpu) {
      console.log(
        `[LLM] GPU backend: ${this.llama.gpu}${deviceNames.length > 0 ? ` (${deviceNames.join(', ')})` : ''}`,
      );
    } else {
      console.log('[LLM] GPU backend: none detected — running on CPU');
    }

    this.model = await this.llama.loadModel({
      modelPath,
      gpuLayers: config.localLlm.gpuLayers,
    });

    console.log(`[LLM] Offloaded layers: ${this.model.gpuLayers}`);

    this.context = await this.model.createContext({
      contextSize: config.localLlm.contextSize,
    });

    this.initialized = true;
    console.log('[LLM] Model loaded and ready');
  }

  async chat(messages: LlmMessage[], options?: LlmChatOptions): Promise<string> {
    const run = this.chatQueue.then(
      () => this.runChat(messages, options),
      () => this.runChat(messages, options),
    );
    // Keep the chain alive whether the run succeeds or fails.
    this.chatQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async runChat(messages: LlmMessage[], options?: LlmChatOptions): Promise<string> {
    await this.ensureInitialized();

    const context = this.context;
    if (!context) throw new Error('LLM context is not available');

    // Each chat takes one context sequence and must always give it back —
    // otherwise the second request fails with "No sequences left".
    const sequence = context.getSequence();
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

      const timeoutMs = config.localLlm.timeoutMs;
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
