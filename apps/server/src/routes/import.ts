import { Hono } from 'hono'
import { z } from 'zod'
import { ensureAdmin, requireAdmin, requireUser, type AppEnv } from '../auth.js'
import { runtime } from '../config.js'
import { covers } from '../covers.js'
import { db, stmt, type Param, type Stmt } from '../db.js'
import { migrations } from '../migrations.js'
import { reencrypt } from '../secrets.js'

// Moves an existing instance's data (a cratefolk.db from the Docker version) into this one. The browser reads the SQLite file and sends
// it here in pieces, so no command line is needed. Only offered on Cloudflare Workers, only to the admin, and only into an empty instance.

export const importRoutes = new Hono<AppEnv>()
importRoutes.use('*', requireUser, requireAdmin)

// Parents before children. sessions, login_failures and sync_jobs are left behind on purpose: everyone signs in again.
export const IMPORT_TABLES = [
  'users', 'releases', 'copies', 'wishlist', 'market_stats', 'collections', 'collection_copies', 'shares',
  'password_resets', 'trivia', 'artist_trivia', 'settings', 'events', 'discogs_removals',
] as const
type Table = (typeof IMPORT_TABLES)[number]

/** Columns that point at users, which are renumbered when the admin account already exists here under another id. */
const USER_REFS: Partial<Record<Table, string[]>> = {
  releases: ['owner_id'],
  copies: ['user_id', 'co_owner_id'],
  wishlist: ['user_id'],
  collections: ['user_id'],
  shares: ['user_id'],
  password_resets: ['user_id'],
  events: ['user_id'],
  discogs_removals: ['user_id'],
}

const STATE = 'import_state'
const USER_MAP = 'import_user_map'
const getSetting = async (key: string) => (await db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key))?.value ?? null
const setSetting = (key: string, value: string) =>
  db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value)

/** True when nothing but (at most) the admin account exists, so an import can't overwrite anyone's data. */
async function isEmpty(): Promise<boolean> {
  const row = await db.get<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM users) - 1 + (SELECT COUNT(*) FROM releases) + (SELECT COUNT(*) FROM copies) + (SELECT COUNT(*) FROM wishlist)
            + (SELECT COUNT(*) FROM collections) AS n`,
  )
  return (row?.n ?? 0) <= 0
}

const notWorker = (c: { json: (body: unknown, status: 404) => Response }) => c.json({ error: 'Importing is only available on Cloudflare' }, 404)

importRoutes.get('/status', async (c) => {
  if (!runtime.worker) return c.json({ available: false })
  const state = (await getSetting(STATE)) ?? 'idle'
  return c.json({ available: state !== 'done', state, empty: await isEmpty(), schemaVersion: migrations.length })
})

importRoutes.post('/start', async (c) => {
  if (!runtime.worker) return notWorker(c)
  const state = (await getSetting(STATE)) ?? 'idle'
  if (state === 'done') return c.json({ error: 'An import has already been completed' }, 409)
  if (state !== 'running' && !(await isEmpty())) return c.json({ error: 'This instance already has data, so nothing can be imported into it' }, 409)
  await setSetting(STATE, 'running')
  await setSetting(USER_MAP, '{}')
  return c.json({ ok: true })
})

/** Throws away what an interrupted import put in, so it can start again. Only while an import is marked as running. */
importRoutes.post('/reset', async (c) => {
  if (!runtime.worker) return notWorker(c)
  if ((await getSetting(STATE)) !== 'running') return c.json({ error: 'No import is in progress' }, 409)
  const me = c.get('user').id
  const wipe = [...IMPORT_TABLES].reverse().filter((t) => t !== 'settings' && t !== 'users').map((t) => stmt(`DELETE FROM ${t}`))
  await db.batch([...wipe, stmt('DELETE FROM users WHERE id != ?', me), stmt("DELETE FROM settings WHERE key NOT IN ('secret_key', ?, ?)", STATE, USER_MAP)])
  await setSetting(USER_MAP, '{}')
  return c.json({ ok: true })
})

const value = z.union([z.string(), z.number(), z.null()])
const rowsSchema = z.object({
  table: z.enum(IMPORT_TABLES),
  rows: z.array(z.record(value)).max(100),
  /** The old instance's data/secret.key (base64), to carry users' saved Discogs tokens over. Only used for the users table. */
  oldKey: z.string().max(200).optional(),
})

const columnCache = new Map<string, string[]>()
async function columnsOf(table: Table): Promise<string[]> {
  let cols = columnCache.get(table)
  if (!cols) {
    cols = (await db.all<{ name: string }>(`PRAGMA table_info(${table})`)).map((r) => r.name)
    columnCache.set(table, cols)
  }
  return cols
}

const insert = (table: Table, row: Record<string, Param>): Stmt => {
  const cols = Object.keys(row)
  const verb = table === 'settings' ? 'INSERT OR REPLACE' : 'INSERT'
  return stmt(`${verb} INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, ...cols.map((k) => row[k]))
}

importRoutes.post('/rows', async (c) => {
  if (!runtime.worker) return notWorker(c)
  if ((await getSetting(STATE)) !== 'running') return c.json({ error: 'Start the import first' }, 409)
  const parsed = rowsSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Invalid import data' }, 400)
  const { table, oldKey } = parsed.data
  const known = new Set(await columnsOf(table))
  // Only columns this version knows; anything newer or older is left to the defaults.
  const rows = parsed.data.rows
    .map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => known.has(k))) as Record<string, Param>)
    .filter((r) => Object.keys(r).length)
    .filter((r) => !(table === 'settings' && (r.key === 'secret_key' || r.key === STATE || r.key === USER_MAP)))

  if (table === 'users') {
    const map = JSON.parse((await getSetting(USER_MAP)) ?? '{}') as Record<string, number>
    for (const row of rows) {
      const oldId = Number(row.id)
      if (row.discogs_token) {
        try {
          if (!oldKey) throw new Error('no key')
          row.discogs_token = reencrypt(String(row.discogs_token), oldKey)
        } catch {
          row.discogs_token = null // can't be carried over; the user reconnects Discogs
          row.discogs_username = null
        }
      }
      const existing = await db.get<{ id: number }>('SELECT id FROM users WHERE email = ? COLLATE NOCASE', String(row.email))
      if (existing) {
        // Typically the admin from ADMIN_EMAIL, created when this instance first started: keep its login, take over the profile.
        const { id: _id, email: _email, password_hash: _hash, role: _role, disabled: _disabled, ...profile } = row
        const cols = Object.keys(profile)
        if (cols.length) await db.run(`UPDATE users SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...cols.map((k) => profile[k]), existing.id)
        if (existing.id !== oldId) map[String(oldId)] = existing.id
      } else {
        const taken = await db.get('SELECT 1 FROM users WHERE id = ?', oldId)
        if (taken) delete row.id
        const res = await db.run(insert('users', row).sql, ...insert('users', row).params)
        if (taken) map[String(oldId)] = res.lastInsertRowid
      }
    }
    await setSetting(USER_MAP, JSON.stringify(map))
    return c.json({ imported: rows.length })
  }

  const map = JSON.parse((await getSetting(USER_MAP)) ?? '{}') as Record<string, number>
  for (const col of USER_REFS[table] ?? []) for (const row of rows) if (row[col] != null && map[String(row[col])]) row[col] = map[String(row[col])]!
  if (rows.length) await db.batch(rows.map((r) => insert(table, r)))
  return c.json({ imported: rows.length })
})

importRoutes.put('/cover/:id', async (c) => {
  if (!runtime.worker) return notWorker(c)
  if ((await getSetting(STATE)) !== 'running') return c.json({ error: 'Start the import first' }, 409)
  const id = Number(c.req.param('id'))
  const bytes = new Uint8Array(await c.req.arrayBuffer())
  if (!Number.isInteger(id) || id === 0) return c.json({ error: 'Invalid release' }, 400)
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return c.json({ error: 'Covers must be JPEG images' }, 400)
  await covers.write(id, bytes)
  return c.json({ ok: true })
})

importRoutes.post('/finish', async (c) => {
  if (!runtime.worker) return notWorker(c)
  if ((await getSetting(STATE)) !== 'running') return c.json({ error: 'No import is in progress' }, 409)
  // Whatever password the imported admin had, ADMIN_EMAIL / ADMIN_PASSWORD stay the source of truth, as on every start.
  await ensureAdmin()
  await setSetting(STATE, 'done')
  await db.run('DELETE FROM settings WHERE key = ?', USER_MAP)
  await db.run('DELETE FROM sessions')
  return c.json({ ok: true })
})
