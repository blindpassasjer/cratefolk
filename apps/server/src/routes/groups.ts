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
groupRoutes.get('/', async (c) => {
  const userId = c.get('user').id
  const totals = await db.get('SELECT COUNT(*) AS records, COALESCE(SUM(for_sale), 0) AS forSale FROM copies WHERE user_id = ? OR co_owner_id = ?', userId, userId)
  return c.json({ collections: await db.all(`${GROUP_SELECT} WHERE g.user_id = ? ORDER BY g.name`, userId), totals })
})

groupRoutes.post('/', async (c) => {
  const parsed = nameSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Give the crate a name (up to 60 characters)' }, 400)
  const userId = c.get('user').id
  if (await db.get('SELECT 1 FROM collections WHERE user_id = ? AND name = ?', userId, parsed.data.name)) {
    return c.json({ error: 'You already have a crate with that name' }, 409)
  }
  const info = await db.run('INSERT INTO collections (user_id, name) VALUES (?, ?)', userId, parsed.data.name)
  return c.json({ collection: await db.get(`${GROUP_SELECT} WHERE g.id = ?`, info.lastInsertRowid) }, 201)
})

groupRoutes.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const parsed = nameSchema.safeParse(await c.req.json().catch(() => null))
  if (!Number.isInteger(id) || !parsed.success) return c.json({ error: 'Invalid request' }, 400)
  const userId = c.get('user').id
  if (!await db.get('SELECT 1 FROM collections WHERE id = ? AND user_id = ?', id, userId)) {
    return c.json({ error: 'Crate not found' }, 404)
  }
  const clash = await db.get('SELECT id FROM collections WHERE user_id = ? AND name = ?', userId, parsed.data.name) as { id: number } | undefined
  if (clash && clash.id !== id) return c.json({ error: 'You already have a crate with that name' }, 409)
  await db.run('UPDATE collections SET name = ? WHERE id = ?', parsed.data.name, id)
  return c.json({ collection: await db.get(`${GROUP_SELECT} WHERE g.id = ?`, id) })
})

// Deleting a collection never deletes the records in it.
groupRoutes.delete('/:id', async (c) => {
  const res = await db.run('DELETE FROM collections WHERE id = ? AND user_id = ?', Number(c.req.param('id')), c.get('user').id)
  return res.changes ? c.json({ ok: true }) : c.json({ error: 'Crate not found' }, 404)
})

async function owns(userId: number, collectionId: number, copyId: number): Promise<boolean> {
  return !!await db.get(
      `SELECT 1 FROM collections g, copies c
       WHERE g.id = ? AND g.user_id = ? AND c.id = ? AND c.user_id = ?`, collectionId, userId, copyId, userId)
}

groupRoutes.put('/:id/copies/:copyId', async (c) => {
  const id = Number(c.req.param('id'))
  const copyId = Number(c.req.param('copyId'))
  if (!await owns(c.get('user').id, id, copyId)) return c.json({ error: 'Not found' }, 404)
  await db.run('INSERT OR IGNORE INTO collection_copies (collection_id, copy_id) VALUES (?, ?)', id, copyId)
  return c.json({ ok: true })
})

groupRoutes.delete('/:id/copies/:copyId', async (c) => {
  const id = Number(c.req.param('id'))
  const copyId = Number(c.req.param('copyId'))
  if (!await owns(c.get('user').id, id, copyId)) return c.json({ error: 'Not found' }, 404)
  await db.run('DELETE FROM collection_copies WHERE collection_id = ? AND copy_id = ?', id, copyId)
  return c.json({ ok: true })
})
