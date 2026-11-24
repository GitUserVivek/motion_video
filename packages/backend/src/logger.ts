/**
 * Shared action logger for the job pipeline.
 *
 * Every line keeps the existing `[Scope]` prefix so established log searches
 * still work. The leading emoji identifies the phase at a glance in a long
 * Kaggle/CI log, while success, warning and failure use fixed icons so the
 * healthy and broken steps can be filtered quickly.
 *
 * Emoji are only used when stdout can actually carry them. A pipe or console
 * with an ASCII/latin-1 encoding turns each one into `?`, which buries the
 * message in `????` — so those streams get short ASCII tags instead.
 */

function stdoutSupportsUnicode(): boolean {
  const override = process.env.EDUMOTION_ASCII_LOGS;
  if (override && override !== '0') return false;

  const encoding = (process.stdout as { encoding?: string | null }).encoding;
  if (encoding) return /^utf-?8$/i.test(encoding);

  // Without an explicit stream encoding, trust the locale. Containers that
  // never set LANG default to C, which is where the `?` output comes from.
  const locale = process.env.LC_ALL || process.env.LC_CTYPE || process.env.LANG || '';
  return /utf-?8/i.test(locale);
}

const UNICODE = stdoutSupportsUnicode();

const ASCII_SCOPE: Record<string, string> = {
  Worker: 'WORK',
  RenderWorker: 'RNDR',
  Script: 'SCRP',
  TTS: 'TTS ',
  Subtitles: 'SUBS',
  Content: 'CONT',
  Research: 'RSCH',
  Storyboard: 'STOR',
  Assets: 'ASTS',
  Validation: 'VALD',
  Render: 'REND',
  Quality: 'QUAL',
  Editorial: 'EDIT',
  Job: 'JOB ',
  HTTP: 'HTTP',
  Server: 'SRVR',
  DB: 'DB  ',
  LLM: 'LLM ',
  Error: 'ERR ',
};

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

/** Local `YYYY-MM-DD HH:MM:SS`, so a log line can be placed in time at a glance. */
function timestamp(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  );
}

const ASCII_MAP: Record<string, string> = {
  '—': '-',
  '–': '-',
  '…': '...',
  '’': "'",
  '‘': "'",
  '“': '"',
  '”': '"',
  '→': '->',
  '←': '<-',
  '·': '.',
  '×': 'x',
  '✓': 'OK',
  '✗': 'x',
  '⚠': '!',
  '▶': '>',
};

/** Keep message text readable on an ASCII stream instead of emitting `?`. */
function toAscii(text: string): string {
  return text
    .replace(/[—–…’‘“”→←·×✓✗⚠▶]/g, (char) => ASCII_MAP[char] ?? char)
    .replace(/[^\x20-\x7E\n\t]/g, '')
    .replace(/[ \t]{2,}/g, ' ');
}

/** ASCII fallback tag for a scope, e.g. `[REND]` instead of a camera emoji. */
function asciiTag(scope: string): string {
  const tag = ASCII_SCOPE[scope] ?? scope.slice(0, 4).toUpperCase().padEnd(4, ' ');
  return `[${tag}]`;
}

function write(
  level: 'log' | 'warn' | 'error',
  icon: string,
  scope: string,
  message: string,
  detail?: unknown,
): void {
  const body = UNICODE ? line(icon, scope, message) : `${asciiTag(scope)} ${toAscii(message)}`;
  const prefix = `${timestamp()} ${body}`;
  const sink = level === 'log' ? console.log : level === 'warn' ? console.warn : console.error;
  if (detail === undefined) sink(prefix);
  else sink(prefix, detail);
}

/** A phase or action is starting. Pass `icon` for an action-specific glyph. */
export function logStep(
  scope: string,
  message: string,
  icon = SCOPE_EMOJI[scope] ?? '▶️',
): void {
  write('log', icon, scope, message);
}

export function logSuccess(scope: string, message: string): void {
  write('log', '✅', scope, message);
}

export function logInfo(scope: string, message: string, icon = 'ℹ️'): void {
  write('log', icon, scope, message);
}

export function logWarn(scope: string, message: string): void {
  write('warn', '⚠️', scope, message);
}

export function logError(scope: string, message: string, detail?: unknown): void {
  write('error', '❌', scope, message, detail);
}
