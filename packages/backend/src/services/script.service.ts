import { ollamaService } from './ollama.service.js';
import {
  buildScriptGeneratePrompt,
  buildScriptSystemPrompt,
} from '../prompts/script-generate.prompt.js';
import {
  buildScriptValidatePrompt,
  buildValidateSystemPrompt,
} from '../prompts/script-validate.prompt.js';
import {
  buildScriptRewritePrompt,
  buildRewriteSystemPrompt,
} from '../prompts/script-rewrite.prompt.js';
import { AppError } from '../middleware/errorHandler.js';

class ScriptService {
  async generateFromTopic(
    topic: string,
    videoConfig?: { duration?: number; language?: string },
  ): Promise<string> {
    const duration = videoConfig?.duration ?? 40;
    const language = videoConfig?.language ?? 'en';

    const content = await ollamaService.chat([
      { role: 'system', content: buildScriptSystemPrompt() },
      { role: 'user', content: buildScriptGeneratePrompt(topic, duration, language) },
    ], {
      temperature: 0.7,
      num_predict: 2048,
    });

    const cleaned = this.cleanScriptOutput(content);
    if (cleaned.length < 20) {
      throw new AppError('GENERATION_FAILED', 'Generated script is too short or empty', 500);
    }
    return cleaned;
  }

  async validateScript(content: string): Promise<string> {
    const result = await ollamaService.chat([
      { role: 'system', content: buildValidateSystemPrompt() },
      { role: 'user', content: buildScriptValidatePrompt(content) },
    ], {
      temperature: 0.3,
      num_predict: 2048,
    });
    return this.cleanScriptOutput(result);
  }

  async rewriteScript(content: string, mode: 'improve' | 'preserve'): Promise<string> {
    const result = await ollamaService.chat([
      { role: 'system', content: buildRewriteSystemPrompt() },
      { role: 'user', content: buildScriptRewritePrompt(content, mode) },
    ], {
      temperature: mode === 'improve' ? 0.6 : 0.2,
      num_predict: 2048,
    });
    return this.cleanScriptOutput(result);
  }

  private cleanScriptOutput(raw: string): string {
    // Remove common LLM preamble patterns
    const cleaned = raw
      .replace(/^(here('s| is) (the|your) (script|narration)[:\n]+)/i, '')
      .replace(/^(sure[,!.]?\s*)/i, '')
      .replace(/^```[\s\S]*?```$/gm, (match) => match.replace(/```\w*\n?/g, '').trim())
      .trim();
    return cleaned;
  }
}

export const scriptService = new ScriptService();
