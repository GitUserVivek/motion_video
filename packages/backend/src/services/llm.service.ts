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

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;
    this.initializing = this._init();
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

    this.llama = await getLlama({
      gpu: config.localLlm.gpuLayers !== 0 ? 'auto' : false,
    });

    this.model = await this.llama.loadModel({ modelPath });

    this.context = await this.model.createContext({
      contextSize: config.localLlm.contextSize,
    });

    this.initialized = true;
    console.log('[LLM] Model loaded and ready');
  }

  async chat(messages: LlmMessage[], options?: LlmChatOptions): Promise<string> {
    await this.ensureInitialized();

    const session = new LlamaChatSession({
      contextSequence: this.context!.getSequence(),
    });

    const systemMsg = messages.find((m) => m.role === 'system')?.content ?? '';
    const userMessages = messages.filter((m) => m.role !== 'system');

    // Prepend system prompt to first user message if present
    if (systemMsg && userMessages[0]) {
      userMessages[0] = {
        ...userMessages[0],
        content: `${systemMsg}\n\n${userMessages[0].content}`,
      };
    }

    const timeoutMs = config.localLlm.timeoutMs;
    let reply = '';

    const generatePromise = (async () => {
      for (let i = 0; i < userMessages.length; i++) {
        const msg = userMessages[i];
        if (!msg) continue;
        if (i < userMessages.length - 1) {
          await session.prompt(msg.content, { maxTokens: 10, temperature: 0.1 });
        } else {
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
      setTimeout(() => reject(new Error(`LLM timed out after ${timeoutMs}ms`)), timeoutMs),
    );

    return Promise.race([generatePromise, timeoutPromise]);
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
    this.initialized = false;
    this.initializing = null;
  }
}

export const llmService = new LlmService();
export { llmService as ollamaService };
