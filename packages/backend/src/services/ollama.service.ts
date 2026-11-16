// Backwards-compatibility shim.
// All logic has moved to llm.service.ts (node-llama-cpp local inference).
// Existing imports of ollamaService continue to work unchanged.
export { llmService as ollamaService, llmService } from './llm.service.js';
export type { LlmMessage, LlmChatOptions } from './llm.service.js';
