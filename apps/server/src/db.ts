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
  `
  ALTER TABLE users ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';

  CREATE TABLE market_stats (
    release_id   INTEGER NOT NULL,
    currency     TEXT NOT NULL,
    num_for_sale INTEGER NOT NULL,
    lowest_price REAL,
    fetched_at   INTEGER NOT NULL,
    PRIMARY KEY (release_id, currency)
  );
  `,
  `
  -- User-made groupings of owned copies ("Jazz", "For sale", ...). A copy can be in several.
  CREATE TABLE collections (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL COLLATE NOCASE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, name)
  );

  CREATE TABLE collection_copies (
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    copy_id       INTEGER NOT NULL REFERENCES copies(id) ON DELETE CASCADE,
    added_at      TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (collection_id, copy_id)
  );
  CREATE INDEX collection_copies_copy_id ON collection_copies(copy_id);
  `,
  `
  -- Public read-only links. kind: 'all' (every owned record), 'group' (one collection), 'wishlist'.
  CREATE TABLE shares (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL CHECK (kind IN ('all', 'group', 'wishlist')),
    group_id   INTEGER REFERENCES collections(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX shares_target ON shares(user_id, kind, COALESCE(group_id, 0));
  `,
  `
  -- A copy can be put up for sale with an asking price (in the owner's currency at the time it was set).
  ALTER TABLE copies ADD COLUMN for_sale INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE copies ADD COLUMN asking_price REAL;
  ALTER TABLE copies ADD COLUMN price_currency TEXT;

  -- Widen shares.kind to allow a public 'forsale' link (SQLite can't alter a CHECK constraint).
  CREATE TABLE shares_new (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL CHECK (kind IN ('all', 'group', 'wishlist', 'forsale')),
    group_id   INTEGER REFERENCES collections(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT INTO shares_new SELECT token, user_id, kind, group_id, created_at FROM shares;
  DROP TABLE shares;
  ALTER TABLE shares_new RENAME TO shares;
  CREATE UNIQUE INDEX shares_target ON shares(user_id, kind, COALESCE(group_id, 0));
  `,
  `
  -- Records added by hand (negative IDs) belong to the user who made them; Discogs releases stay shared.
  ALTER TABLE releases ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
  UPDATE releases SET owner_id = COALESCE(
    (SELECT user_id FROM copies WHERE release_id = releases.id ORDER BY id LIMIT 1),
    (SELECT user_id FROM wishlist WHERE release_id = releases.id ORDER BY id LIMIT 1)
  ) WHERE id < 0;
  `,
  `
  -- One-time password reset links, created by an admin. Only the hash of the token is stored.
  CREATE TABLE password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX password_resets_user_id ON password_resets(user_id);
  `,
  `
  -- Wikipedia trivia per release. facts is NULL when no article was found, so that is cached too.
  CREATE TABLE trivia (
    release_id INTEGER PRIMARY KEY REFERENCES releases(id) ON DELETE CASCADE,
    facts      TEXT,
    title      TEXT,
    url        TEXT,
    fetched_at INTEGER NOT NULL
  );
  `,
  `
  -- Wikipedia facts about an artist, shared by every release of theirs. Same shape as trivia.
  CREATE TABLE artist_trivia (
    artist_key TEXT PRIMARY KEY,
    facts      TEXT,
    title      TEXT,
    url        TEXT,
    fetched_at INTEGER NOT NULL
  );
  `,
  `
  -- Instance-wide admin settings as key/value pairs. Registration is closed unless set to '1'.
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  `
  -- A copy can be jointly owned: it then shows up in both owners' collections, and either can edit it.
  ALTER TABLE copies ADD COLUMN co_owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
  CREATE INDEX copies_co_owner_id ON copies(co_owner_id);

  -- Opt-in: let other signed-in members browse this user's collection and/or wishlist.
  ALTER TABLE users ADD COLUMN share_collection INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN share_wishlist INTEGER NOT NULL DEFAULT 0;
  `,
]

fs.mkdirSync(config.dataDir, { recursive: true })
// Cratelog was called WaxCrate before 0.4.0: adopt an existing database (and its WAL files) under the new name.
const dbFile = path.join(config.dataDir, 'cratelog.db')
const legacyDbFile = path.join(config.dataDir, 'waxcrate.db')
if (!fs.existsSync(dbFile) && fs.existsSync(legacyDbFile)) {
  for (const suffix of ['', '-wal', '-shm']) if (fs.existsSync(legacyDbFile + suffix)) fs.renameSync(legacyDbFile + suffix, dbFile + suffix)
}
export const db = new Database(dbFile)
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
