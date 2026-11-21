// Writes the server's migrations as numbered .sql files for `wrangler d1 migrations apply`. wrangler remembers which ones ran
// (by file name), so the numbering must never change: new migrations are appended in apps/server/src/migrations.ts and get the next number.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrations } from '../../server/src/migrations.js'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(dir)
migrations.forEach((sql, i) => {
  const name = `${String(i + 1).padStart(4, '0')}_schema.sql`
  fs.writeFileSync(path.join(dir, name), sql.trim() + '\n')
})
console.log(`Wrote ${migrations.length} migrations to ${path.relative(process.cwd(), dir)}`)
