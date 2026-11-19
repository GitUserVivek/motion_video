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
import { WORDS_PER_SECOND } from '@edumotion/shared';

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
      num_predict: 1024,
    });

    const cleaned = this.cleanScriptOutput(content);
    if (cleaned.replace(/\s+/g, ' ').trim().length < 20) {
      throw new AppError('GENERATION_FAILED', 'Generated script is too short or empty', 500);
    }

    // Keep the narration within the requested video length; the model tends to
    // overshoot, and an oversized script silently turns a 40s video into a 2min one.
    const targetWords = Math.round(duration * WORDS_PER_SECOND);
    return this.enforceWordBudget(cleaned, Math.round(targetWords * 1.2));
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

  /**
   * Turn raw model output into narration lines: strips markdown and list
   * syntax, splits into punctuated sentences, and keeps one sentence per line
   * so TTS and caption splitting both get clean input.
   */
  private cleanScriptOutput(raw: string): string {
    let text = raw.replace(/\r\n?/g, '\n').replace(/```[a-z0-9]*\n?/gi, '');

    // Drop a leading meta line like "Here is a 40-second script about X:"
    text = text.replace(
      /^\s*(?:here(?:'s| is)|sure|certainly|of course)[^\n]*:\s*\n?/i,
      '',
    );

    const lines = text
      .split('\n')
      .map((line) =>
        line
          .replace(/^\s{0,3}#{1,6}\s*/, '') // markdown headings
          .replace(/^\s*[-*•]\s+/, '') // bullets
          .replace(/^\s*\d{1,2}[.)]\s+/, '') // numbered list markers
          .replace(/^\s*>\s*/, '') // blockquote
          .replace(/^\s*(?:narrator|speaker|voice ?over|host|script)\s*[:\-]\s*/i, '')
          .replace(/^\s*(?:introduction|body|conclusion|outro|intro)\s*:\s*/i, '')
          .replace(/\*\*|__|\*/g, '') // bold/italic markers
          .replace(/[ \t]+/g, ' ')
          .trim(),
      )
      .filter((line) => line.length > 0);

    const sentences = lines
      .join(' ')
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => this.normalizeSentence(sentence))
      .filter((sentence) => sentence.length > 0);

    return sentences.join('\n');
  }

  private normalizeSentence(sentence: string): string {
    const trimmed = sentence.trim().replace(/\s+/g, ' ');
    if (!trimmed) return '';
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  }

  /**
   * Trim at a sentence boundary when the narration is far longer than the
   * requested duration. Spoken English is ~2.5 words per second.
   */
  private enforceWordBudget(text: string, maxWords: number): string {
    const sentences = text.split('\n').filter(Boolean);
    if (sentences.length <= 1) return text;

    const kept: string[] = [];
    let words = 0;

    for (const sentence of sentences) {
      const count = this.wordCount(sentence);
      if (kept.length > 0 && words + count > maxWords) break;
      kept.push(sentence);
      words += count;
    }

    return kept.length > 0 ? kept.join('\n') : text;
  }

  private wordCount(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
  }
}

export const scriptService = new ScriptService();
