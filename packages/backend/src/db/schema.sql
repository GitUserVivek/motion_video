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
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scenes (
  id              TEXT PRIMARY KEY,
  job_id          TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  scene_index     INTEGER NOT NULL,
  instruction_json TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS videos (
  id              TEXT PRIMARY KEY,
  job_id          TEXT NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  file_path       TEXT NOT NULL,
  duration_sec    REAL NOT NULL DEFAULT 0,
  size_bytes      INTEGER NOT NULL DEFAULT 0,
  thumbnail_path  TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('ollama_model', 'qwen2.5:7b'),
  ('tts_engine', 'edge-tts'),
  ('tts_voice', 'en-US-AriaNeural'),
  ('default_duration', '40'),
  ('default_aspect_ratio', '9:16'),
  ('max_concurrent_jobs', '1');
