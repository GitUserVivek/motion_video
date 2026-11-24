/**
 * Shared action logger for the job pipeline.
 *
 * Every line keeps the existing `[Scope]` prefix so established log searches
 * still work. The leading emoji identifies the phase at a glance in a long
 * Kaggle/CI log, while success, warning and failure use fixed icons so the
 * healthy and broken steps can be filtered quickly.
 */

const SCOPE_EMOJI: Record<string, string> = {
  Worker: '🎬',
  RenderWorker: '⚙️',
  Script: '✍️',
  TTS: '🎙️',
  Subtitles: '📝',
  Content: '🧠',
  Research: '🔎',
  Storyboard: '🗂️',
  Assets: '🖼️',
  Validation: '🧪',
  Render: '🎥',
  Quality: '📊',
  Editorial: '🧐',
  Job: '📦',
  HTTP: '🌐',
  Server: '🖥️',
  DB: '🗄️',
  LLM: '🤖',
  Error: '💥',
};

function line(icon: string, scope: string, message: string): string {
  return `${icon} [${scope}] ${message}`;
}

/** A phase or action is starting. Pass `icon` for an action-specific glyph. */
export function logStep(
  scope: string,
  message: string,
  icon = SCOPE_EMOJI[scope] ?? '▶️',
): void {
  console.log(line(icon, scope, message));
}

export function logSuccess(scope: string, message: string): void {
  console.log(line('✅', scope, message));
}

export function logInfo(scope: string, message: string, icon = 'ℹ️'): void {
  console.log(line(icon, scope, message));
}

export function logWarn(scope: string, message: string): void {
  console.warn(line('⚠️', scope, message));
}

export function logError(scope: string, message: string, detail?: unknown): void {
  if (detail === undefined) {
    console.error(line('❌', scope, message));
    return;
  }
  console.error(line('❌', scope, message), detail);
}
