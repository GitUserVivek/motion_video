import { config } from '../config.js';

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream: false;
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
  };
}

interface OllamaChatResponse {
  model: string;
  message: OllamaMessage;
  done: boolean;
  total_duration?: number;
}

interface OllamaTagsResponse {
  models: Array<{ name: string; size: number }>;
}

class OllamaService {
  private readonly baseUrl: string;
  private currentModel: string;

  constructor() {
    this.baseUrl = config.ollama.baseUrl;
    this.currentModel = config.ollama.model;
  }

  async chat(
    messages: OllamaMessage[],
    options?: OllamaChatRequest['options'],
  ): Promise<string> {
    const request: OllamaChatRequest = {
      model: this.currentModel,
      messages,
      stream: false,
      options,
    };

    let attempt = 0;
    const maxAttempts = 3;

    while (attempt < maxAttempts) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.ollama.timeoutMs);

        const response = await fetch(`${this.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Ollama API error ${response.status}: ${text}`);
        }

        const data = (await response.json()) as OllamaChatResponse;
        return data.message.content;
      } catch (err) {
        attempt++;
        if (attempt >= maxAttempts) {
          // Try fallback model on last attempt
          if (this.currentModel !== config.ollama.fallbackModel) {
            console.warn(`[Ollama] Switching to fallback model ${config.ollama.fallbackModel}`);
            this.currentModel = config.ollama.fallbackModel;
            attempt = 0;
            continue;
          }
          throw new Error(`Ollama failed after ${maxAttempts} attempts: ${String(err)}`);
        }
        const delay = 1000 * attempt;
        console.warn(`[Ollama] Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    throw new Error('Ollama: exhausted all retry attempts');
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return [];
      const data = (await res.json()) as OllamaTagsResponse;
      return data.models.map((m) => m.name);
    } catch {
      return [];
    }
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  setModel(model: string): void {
    this.currentModel = model;
  }
}

export const ollamaService = new OllamaService();
