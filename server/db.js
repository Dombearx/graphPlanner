import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'graphplanner.sqlite'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS plans (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  archived    INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nodes (
  id           TEXT PRIMARY KEY,
  plan_id      TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  target_count INTEGER NOT NULL DEFAULT 1,
  done_count   INTEGER NOT NULL DEFAULT 0,
  x            REAL NOT NULL DEFAULT 0,
  y            REAL NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_nodes_plan ON nodes(plan_id);

CREATE TABLE IF NOT EXISTS edges (
  id        TEXT PRIMARY KEY,
  plan_id   TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  UNIQUE (source_id, target_id)
);
CREATE INDEX IF NOT EXISTS idx_edges_plan ON edges(plan_id);

CREATE TABLE IF NOT EXISTS assignments (
  node_id    TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  person     TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (node_id, person)
);

CREATE TABLE IF NOT EXISTS contributions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id    TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  person     TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contrib_node ON contributions(node_id);
`);

export const now = () => new Date().toISOString();
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
