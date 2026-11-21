// Turns an existing Cratefolk data directory into SQL that D1 accepts, so an instance can move to Cloudflare with its data.
//
//   node scripts/export-sql.mjs <path to cratefolk.db> [output.sql]
//
// Your database file is only read: it is copied (safely, with the WAL applied) to a temporary file, brought up to the current schema there,
// and dumped as INSERT statements. Load the result AFTER the schema exists: `wrangler d1 migrations apply cratefolk --remote`, then
// `wrangler d1 execute cratefolk --remote --file=<output.sql>`. Sessions are left out (everyone signs in once more).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { migrations } from '../../server/src/migrations.js'

const [source, out = 'cratefolk-data.sql'] = process.argv.slice(2)
if (!source || !fs.existsSync(source)) {
  console.error('Usage: node scripts/export-sql.mjs <path to cratefolk.db> [output.sql]')
  process.exit(1)
}

const SKIP = new Set(['sqlite_sequence', 'sessions', 'login_failures', 'sync_jobs'])

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cratefolk-export-')), 'snapshot.db')
const original = new Database(source, { readonly: true, fileMustExist: true })
await original.backup(tmp) // a consistent copy, even if the app is running
original.close()

const db = new Database(tmp)
const version = db.pragma('user_version', { simple: true })
if (version > migrations.length) {
  console.error(`This database is from a newer Cratefolk (schema ${version}) than this checkout knows (${migrations.length}). Update the repo first.`)
  process.exit(1)
}
for (let v = version; v < migrations.length; v++) db.exec(migrations[v])

const literal = (value) => {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  if (Buffer.isBuffer(value)) return `X'${value.toString('hex')}'`
  return `'${String(value).replaceAll("'", "''")}'`
}

// Parents before children, so foreign keys hold even without deferring them.
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((t) => t.name).filter((n) => !SKIP.has(n))
const parents = new Map(tables.map((t) => [t, new Set(db.prepare(`PRAGMA foreign_key_list(${JSON.stringify(t)})`).all().map((f) => f.table).filter((p) => p !== t && tables.includes(p)))]))
const ordered = []
while (ordered.length < tables.length) {
  const next = tables.find((t) => !ordered.includes(t) && [...parents.get(t)].every((p) => ordered.includes(p)))
  if (!next) throw new Error('Circular foreign keys between tables')
  ordered.push(next)
}

const lines = ['PRAGMA defer_foreign_keys = on;']
const counts = {}
for (const table of ordered) {
  const columns = db.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all().map((c) => c.name)
  const rows = db.prepare(`SELECT * FROM ${JSON.stringify(table)}`).all()
  counts[table] = rows.length
  for (const row of rows) {
    lines.push(`INSERT INTO ${JSON.stringify(table)} (${columns.map((c) => JSON.stringify(c)).join(', ')}) VALUES (${columns.map((c) => literal(row[c])).join(', ')});`)
  }
}
fs.writeFileSync(out, lines.join('\n') + '\n')
db.close()
fs.rmSync(path.dirname(tmp), { recursive: true, force: true })

console.log(`Wrote ${out}`)
for (const [table, n] of Object.entries(counts)) if (n) console.log(`  ${table.padEnd(20)} ${n}`)
