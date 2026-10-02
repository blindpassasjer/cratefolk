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
