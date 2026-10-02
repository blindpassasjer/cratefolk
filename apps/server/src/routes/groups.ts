import { Hono } from 'hono'
import { z } from 'zod'
import { requireUser, type AppEnv } from '../auth.js'
import { db } from '../db.js'

// User-made collections of owned copies. (The flat list of everything owned is /api/collection.)
export const groupRoutes = new Hono<AppEnv>()
groupRoutes.use('*', requireUser)

const GROUP_SELECT = `
  SELECT g.id, g.name, (SELECT COUNT(*) FROM collection_copies WHERE collection_id = g.id) AS count
  FROM collections g`

const nameSchema = z.object({ name: z.string().trim().min(1).max(60) })

// `totals` are the counts for the "All records" and "For sale" entries next to the crates in the sidebar.
groupRoutes.get('/', (c) => {
  const userId = c.get('user').id
  const totals = db
    .prepare('SELECT COUNT(*) AS records, COALESCE(SUM(for_sale), 0) AS forSale FROM copies WHERE user_id = ?')
    .get(userId)
  return c.json({ collections: db.prepare(`${GROUP_SELECT} WHERE g.user_id = ? ORDER BY g.name`).all(userId), totals })
})

groupRoutes.post('/', async (c) => {
  const parsed = nameSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Give the crate a name (up to 60 characters)' }, 400)
  const userId = c.get('user').id
  if (db.prepare('SELECT 1 FROM collections WHERE user_id = ? AND name = ?').get(userId, parsed.data.name)) {
    return c.json({ error: 'You already have a crate with that name' }, 409)
  }
  const info = db.prepare('INSERT INTO collections (user_id, name) VALUES (?, ?)').run(userId, parsed.data.name)
  return c.json({ collection: db.prepare(`${GROUP_SELECT} WHERE g.id = ?`).get(info.lastInsertRowid) }, 201)
})

groupRoutes.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const parsed = nameSchema.safeParse(await c.req.json().catch(() => null))
  if (!Number.isInteger(id) || !parsed.success) return c.json({ error: 'Invalid request' }, 400)
  const userId = c.get('user').id
  if (!db.prepare('SELECT 1 FROM collections WHERE id = ? AND user_id = ?').get(id, userId)) {
    return c.json({ error: 'Crate not found' }, 404)
  }
  const clash = db
    .prepare('SELECT id FROM collections WHERE user_id = ? AND name = ?')
    .get(userId, parsed.data.name) as { id: number } | undefined
  if (clash && clash.id !== id) return c.json({ error: 'You already have a crate with that name' }, 409)
  db.prepare('UPDATE collections SET name = ? WHERE id = ?').run(parsed.data.name, id)
  return c.json({ collection: db.prepare(`${GROUP_SELECT} WHERE g.id = ?`).get(id) })
})

// Deleting a collection never deletes the records in it.
groupRoutes.delete('/:id', (c) => {
  const res = db
    .prepare('DELETE FROM collections WHERE id = ? AND user_id = ?')
    .run(Number(c.req.param('id')), c.get('user').id)
  return res.changes ? c.json({ ok: true }) : c.json({ error: 'Crate not found' }, 404)
})

function owns(userId: number, collectionId: number, copyId: number): boolean {
  return !!db
    .prepare(
      `SELECT 1 FROM collections g, copies c
       WHERE g.id = ? AND g.user_id = ? AND c.id = ? AND c.user_id = ?`,
    )
    .get(collectionId, userId, copyId, userId)
}

groupRoutes.put('/:id/copies/:copyId', (c) => {
  const id = Number(c.req.param('id'))
  const copyId = Number(c.req.param('copyId'))
  if (!owns(c.get('user').id, id, copyId)) return c.json({ error: 'Not found' }, 404)
  db.prepare('INSERT OR IGNORE INTO collection_copies (collection_id, copy_id) VALUES (?, ?)').run(id, copyId)
  return c.json({ ok: true })
})

groupRoutes.delete('/:id/copies/:copyId', (c) => {
  const id = Number(c.req.param('id'))
  const copyId = Number(c.req.param('copyId'))
  if (!owns(c.get('user').id, id, copyId)) return c.json({ error: 'Not found' }, 404)
  db.prepare('DELETE FROM collection_copies WHERE collection_id = ? AND copy_id = ?').run(id, copyId)
  return c.json({ ok: true })
})
