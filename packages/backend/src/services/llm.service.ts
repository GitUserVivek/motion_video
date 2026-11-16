import path from 'path';
import fs from 'fs';
import { config } from '../config.js';
import { resolveModelPath, downloadModel } from './llm.downloader.js';

// node-llama-cpp v3 uses ESM-only exports; we import dynamically so the
// CommonJS backend can load it at runtime without breaking tsc compilation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LlamaModule = any;

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
  private llama: LlamaModule = null;
  private model: LlamaModule = null;
  private context: LlamaModule = null;
  private initialized = false;
  private initializing: Promise<void> | null = null;

  /**
   * Lazily load the model on first use.
   * Subsequent calls return immediately once the model is loaded.
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;

    this.initializing = this._init();
    await this.initializing;
  }

  private async _init(): Promise<void> {
    const modelPath = resolveModelPath();

    // Download the model if it's not already on disk
    if (!fs.existsSync(modelPath) || fs.statSync(modelPath).size === 0) {
      console.log('[LLM] Model not found locally — starting download...');
      await downloadModel((p) => {
        if (p.percent % 10 === 0) {
          process.stdout.write(`\r[LLM] Downloading model: ${p.percent}%`);
        }
      });
      process.stdout.write('\n');
    }

    console.log(`[LLM] Loading model from ${modelPath}`);

    // Dynamic import — node-llama-cpp is ESM-only
    const { getLlama, LlamaChatSession } = (await import('node-llama-cpp')) as LlamaModule;

    this.llama = await getLlama({
      gpu: config.localLlm.gpuLayers !== 0 ? 'auto' : false,
    });

    this.model = await this.llama.loadModel({
      modelPath,
    });

    this.context = await this.model.createContext({
      contextSize: config.localLlm.contextSize,
    });

    this.initialized = true;
    console.log('[LLM] Model loaded and ready');
  }

  /**
   * Run a chat completion. Matches the interface previously provided by
   * ollamaService.chat() so all callers (script.service, storyboard.service)
   * work without modification.
   */
  async chat(
    messages: LlmMessage[],
    options?: LlmChatOptions,
  ): Promise<string> {
    await this.ensureInitialized();

    const { LlamaChatSession } = (await import('node-llama-cpp')) as LlamaModule;

    const session = new LlamaChatSession({
      contextSequence: this.context.getSequence(),
    });

    // Build a single prompt from the message list.
    // node-llama-cpp handles chat templates automatically when given a
    // chat history array; fall back to manual concatenation if needed.
    const systemMsg = messages.find((m) => m.role === 'system')?.content ?? '';
    const userMessages = messages.filter((m) => m.role !== 'system');

    let result: string;

    const timeoutMs = config.localLlm.timeoutMs;

    const generatePromise = (async (): Promise<string> => {
      // Prime with system prompt if present
      if (systemMsg) {
        // node-llama-cpp v3: system prompt is set at session level
        // We prepend it to the first user message if no native system support
        const firstUser = userMessages[0];
        if (firstUser) {
          firstUser.content = `${systemMsg}\n\n${firstUser.content}`;
        }
      }

      let reply = '';
      for (let i = 0; i < userMessages.length; i++) {
        const msg = userMessages[i];
        if (!msg) continue;
        if (i < userMessages.length - 1) {
          // Intermediate turns — feed without capturing output
          await session.prompt(msg.content, {
            maxTokens: 10,
            temperature: 0.1,
          });
        } else {
          // Final user turn — this is the one we want the reply for
          reply = await session.prompt(msg.content, {
            maxTokens: options?.num_predict ?? config.localLlm.maxTokens,
            temperature: options?.temperature ?? 0.7,
            topP: options?.top_p ?? 0.9,
          });
        }
      }
      return reply;
    })();

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`LLM generation timed out after ${timeoutMs}ms`)), timeoutMs),
    );

    return Promise.race([generatePromise, timeoutPromise]);
  }

  /**
   * Check whether the model file is present on disk.
   * Used by the health endpoint.
   */
  isModelAvailable(): boolean {
    try {
      const modelPath = resolveModelPath();
      return fs.existsSync(modelPath) && fs.statSync(modelPath).size > 0;
    } catch {
      return false;
    }
  }

  getModelPath(): string {
    return resolveModelPath();
  }

  getModelName(): string {
    return config.localLlm.modelName;
  }

  /**
   * Release GPU/memory resources. Call on graceful shutdown.
   */
  async dispose(): Promise<void> {
    if (this.context) await this.context.dispose?.();
    if (this.model) await this.model.dispose?.();
    if (this.llama) await this.llama.dispose?.();
    this.initialized = false;
    this.initializing = null;
  }
}

export const llmService = new LlmService();

// Keep backwards-compatible alias so any code that still imports
// ollamaService by name does not need to be touched.
export { llmService as ollamaService };
