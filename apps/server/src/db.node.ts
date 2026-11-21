import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { config } from './config.js'
import { migrations } from './migrations.js'
import { setDriver, type Param, type RunResult, type Stmt } from './db.js'

// better-sqlite3 is synchronous, so a batch is a plain transaction: nothing else can run in between.
export function openNodeDatabase(): void {
  fs.mkdirSync(config.dataDir, { recursive: true })
  // Cratefolk was called Cratelog (0.4.0-0.6.x) and WaxCrate before that: adopt an existing database (and its WAL files) under the new name.
  const dbFile = path.join(config.dataDir, 'cratefolk.db')
  const legacyDbFile = ['cratelog.db', 'waxcrate.db'].map((name) => path.join(config.dataDir, name)).find((file) => fs.existsSync(file))
  if (!fs.existsSync(dbFile) && legacyDbFile) {
    for (const suffix of ['', '-wal', '-shm']) if (fs.existsSync(legacyDbFile + suffix)) fs.renameSync(legacyDbFile + suffix, dbFile + suffix)
  }
  const sqlite = new Database(dbFile)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  const bind = (params: Param[]) => params.map((p) => (p === undefined ? null : p))
  const run = (sql: string, params: Param[]): RunResult => {
    const info = sqlite.prepare(sql).run(...bind(params))
    return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) }
  }
  const batch = sqlite.transaction((stmts: Stmt[]) => stmts.map((s) => run(s.sql, s.params)))

  setDriver({
    get: async (sql, params) => sqlite.prepare(sql).get(...bind(params)),
    all: async (sql, params) => sqlite.prepare(sql).all(...bind(params)),
    run: async (sql, params) => run(sql, params),
    batch: async (stmts) => batch(stmts),
  })

  // Migrations are append-only and tracked in the file's own user_version.
  const current = sqlite.pragma('user_version', { simple: true }) as number
  for (let v = current; v < migrations.length; v++) {
    sqlite.transaction(() => {
      sqlite.exec(migrations[v]!)
      sqlite.pragma(`user_version = ${v + 1}`)
    })()
  }
}
