import { migrations } from '../../server/src/migrations.js'

/** Splits a migration (plain SQL with `--` comment lines and no string containing `;`) into single statements. */
const statements = (sql: string) =>
  sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)

/**
 * Brings the D1 database up to the current schema, so deploying needs no separate migration step. Each migration and its version
 * mark go in one batch, which is atomic; if two isolates start at once, the loser's batch fails on the version mark and changes nothing.
 */
export async function migrateD1(d1: D1Database): Promise<void> {
  await d1.exec('CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime(\'now\')))')
  const row = await d1.prepare('SELECT MAX(version) AS v FROM _migrations').first<{ v: number | null }>()
  for (let v = row?.v ?? 0; v < migrations.length; v++) {
    try {
      await d1.batch([...statements(migrations[v]!).map((s) => d1.prepare(s)), d1.prepare('INSERT INTO _migrations (version) VALUES (?)').bind(v + 1)])
    } catch (e) {
      const now = await d1.prepare('SELECT MAX(version) AS v FROM _migrations').first<{ v: number | null }>()
      if ((now?.v ?? 0) > v) continue // another isolate got there first
      throw e
    }
  }
}
