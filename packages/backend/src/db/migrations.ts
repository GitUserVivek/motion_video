import { getDb } from './db.js';

// SQL is inlined here so tsc does not need to copy .sql files to dist/.
const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scripts (
  id                        TEXT PRIMARY KEY,
  project_id                TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  mode                      TEXT NOT NULL CHECK(mode IN ('topic', 'own-script')),
  content                   TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','rejected')),
  original_topic            TEXT,
  word_count                INTEGER NOT NULL DEFAULT 0,
  estimated_duration_sec    REAL NOT NULL DEFAULT 0,
  created_at                TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  script_id     TEXT REFERENCES scripts(id),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','failed','cancelled')),
  progress      REAL NOT NULL DEFAULT 0,
  current_step  TEXT NOT NULL DEFAULT 'pending',
  error         TEXT,
  config_json   TEXT NOT NULL DEFAULT '{}',
  retry_count   INTEGER NOT NULL DEFAULT 0,
  scenes_completed INTEGER NOT NULL DEFAULT 0,
  scenes_total     INTEGER NOT NULL DEFAULT 0,
  assets_json      TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scenes (
  id               TEXT PRIMARY KEY,
  job_id           TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  scene_index      INTEGER NOT NULL,
  instruction_json TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS videos (
  id             TEXT PRIMARY KEY,
  job_id         TEXT NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  file_path      TEXT NOT NULL,
  duration_sec   REAL NOT NULL DEFAULT 0,
  size_bytes     INTEGER NOT NULL DEFAULT 0,
  thumbnail_path TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const DEFAULT_SETTINGS: [string, string][] = [
  ['llm_model_name',     'qwen2.5-7b-instruct-q4'],
  ['tts_engine',         'edge-tts'],
  ['tts_voice',          'en-US-AriaNeural'],
  ['default_duration',   '40'],
  ['default_aspect_ratio', '9:16'],
  ['max_concurrent_jobs', '1'],
];

const VALID_JOB_STATUSES = new Set(['pending', 'processing', 'completed', 'failed', 'cancelled']);
const VALID_SCRIPT_STATUSES = new Set(['draft', 'approved', 'rejected']);

/**
 * Repair rows written by the previous JSON store, which turned inline SQL string
 * literals into timestamps and dropped them from WHERE clauses. An unknown
 * `scripts.status` can only come from the approve endpoint, and an unknown
 * `jobs.status` only from the retry re-queue — those rows never ran to
 * completion, so keep the recorded error and mark them failed instead of
 * leaving them invisible to the worker 2000 ms poll.
 */
function repairLegacyRows(): void {
  const db = getDb();
  let scripts = 0;
  let jobs = 0;

  const scriptRows = db.prepare('SELECT id, status FROM scripts').all() as Array<{ id: string; status?: string }>;
  for (const row of scriptRows) {
    if (!row.status) {
      // Rows written before defaults were applied were never approved.
      db.prepare("UPDATE scripts SET status = 'draft' WHERE id = ?").run(row.id);
      scripts++;
    } else if (!VALID_SCRIPT_STATUSES.has(row.status)) {
      db.prepare("UPDATE scripts SET status = 'approved' WHERE id = ?").run(row.id);
      scripts++;
    }
  }

  const jobRows = db.prepare('SELECT id, status FROM jobs').all() as Array<{ id: string; status: string }>;
  for (const row of jobRows) {
    if (!VALID_JOB_STATUSES.has(row.status)) {
      db.prepare("UPDATE jobs SET status = 'failed' WHERE id = ?").run(row.id);
      jobs++;
    }
  }

  // INSERT OR IGNORE previously ignored the `key` primary key, so settings rows
  // were appended on every startup. Keep the newest value per key.
  const settingRows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  const deduped = new Map<string, string>();
  for (const row of settingRows) deduped.set(row.key, row.value);
  let settings = 0;
  if (deduped.size !== settingRows.length) {
    settings = settingRows.length - deduped.size;
    db.prepare('DELETE FROM settings').run();
    const insert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    for (const [key, value] of deduped) insert.run(key, value);
  }

  if (scripts || jobs || settings) {
    console.log(
      `[DB] Repaired legacy rows — scripts: ${scripts}, jobs: ${jobs}, duplicate settings: ${settings}`,
    );
  }
}

/**
 * `CREATE TABLE IF NOT EXISTS` does not touch a table that already exists, so
 * columns added after the first release need an explicit ALTER. SQLite has no
 * `ADD COLUMN IF NOT EXISTS`, hence the PRAGMA check.
 */
function ensureColumns(): void {
  const db = getDb();
  const columns = db.prepare('PRAGMA table_info(jobs)').all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));

  const additions: Array<[string, string]> = [
    ['scenes_completed', 'ALTER TABLE jobs ADD COLUMN scenes_completed INTEGER NOT NULL DEFAULT 0'],
    ['scenes_total', 'ALTER TABLE jobs ADD COLUMN scenes_total INTEGER NOT NULL DEFAULT 0'],
    ['assets_json', 'ALTER TABLE jobs ADD COLUMN assets_json TEXT'],
  ];

  for (const [name, sql] of additions) {
    if (names.has(name)) continue;
    db.exec(sql);
    console.log(`[DB] Added jobs.${name}`);
  }
}

export function runMigrations(): void {
  const db = getDb();

  // Run each DDL statement individually
  const statements = SCHEMA_SQL
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    db.exec(statement + ';');
  }

  ensureColumns();

  // Seed default settings (INSERT OR IGNORE — never overwrites user changes)
  const upsert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  const seedAll = db.transaction(() => {
    for (const [key, value] of DEFAULT_SETTINGS) {
      upsert.run(key, value);
    }
  });
  seedAll();

  repairLegacyRows();

  console.log('[DB] Migrations applied successfully');
}
