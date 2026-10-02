import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { config } from './config.js'

// Append-only: never edit an applied migration, add a new entry instead.
const migrations: string[] = [
  `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('admin', 'user')),
    disabled      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX sessions_user_id ON sessions(user_id);
  `,
  `
  -- Shared cache of Discogs release metadata, keyed by Discogs release ID.
  CREATE TABLE releases (
    id         INTEGER PRIMARY KEY,
    master_id  INTEGER,
    title      TEXT NOT NULL,
    artist     TEXT NOT NULL,
    year       INTEGER,
    country    TEXT,
    label      TEXT,
    catno      TEXT,
    barcode    TEXT,
    format     TEXT,
    genres     TEXT NOT NULL DEFAULT '[]',
    styles     TEXT NOT NULL DEFAULT '[]',
    tracklist  TEXT NOT NULL DEFAULT '[]',
    notes      TEXT,
    has_cover  INTEGER NOT NULL DEFAULT 0,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- One row per physical copy a user owns.
  CREATE TABLE copies (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    release_id      INTEGER NOT NULL REFERENCES releases(id),
    media_condition TEXT,
    sleeve_condition TEXT,
    notes           TEXT,
    added_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX copies_user_id ON copies(user_id);
  CREATE INDEX copies_release_id ON copies(release_id);
  `,
  `
  CREATE TABLE wishlist (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    release_id INTEGER NOT NULL REFERENCES releases(id),
    notes      TEXT,
    added_at   TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, release_id)
  );
  `,
]

fs.mkdirSync(config.dataDir, { recursive: true })
export const db = new Database(path.join(config.dataDir, 'waxcrate.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

export function migrate(): void {
  const current = db.pragma('user_version', { simple: true }) as number
  for (let v = current; v < migrations.length; v++) {
    db.transaction(() => {
      db.exec(migrations[v]!)
      db.pragma(`user_version = ${v + 1}`)
    })()
  }
}
