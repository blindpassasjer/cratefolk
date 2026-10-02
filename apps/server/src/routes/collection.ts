import fs from 'node:fs'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireUser, type AppEnv } from '../auth.js'
import { db } from '../db.js'
import { DiscogsError } from '../discogs.js'
import { coverPath, ensureRelease } from '../releases.js'

export const collectionRoutes = new Hono<AppEnv>()
export const releaseRoutes = new Hono<AppEnv>()
collectionRoutes.use('*', requireUser)
releaseRoutes.use('*', requireUser)

// Discogs/Goldmine grading scale
const condition = z.enum(['M', 'NM', 'VG+', 'VG', 'G+', 'G', 'F', 'P']).nullable()

const COPY_SELECT = `
  SELECT c.id AS copyId, c.release_id AS releaseId, c.media_condition AS mediaCondition,
         c.sleeve_condition AS sleeveCondition, c.notes, c.added_at AS addedAt,
         r.title, r.artist, r.year, r.country, r.label, r.catno, r.format, r.has_cover AS hasCover,
         (SELECT group_concat(collection_id) FROM collection_copies WHERE copy_id = c.id) AS collectionIds
  FROM copies c JOIN releases r ON r.id = c.release_id`

type CopyRow = { collectionIds: string | null } & Record<string, unknown>
const withIds = (row: unknown) => {
  if (!row) return row
  const r = row as CopyRow
  return { ...r, collectionIds: r.collectionIds ? r.collectionIds.split(',').map(Number) : [] }
}

collectionRoutes.get('/', (c) => {
  const groupId = Number(c.req.query('collection')) || null
  const rows = db
    .prepare(
      `${COPY_SELECT} WHERE c.user_id = ?
       ${groupId ? 'AND c.id IN (SELECT copy_id FROM collection_copies WHERE collection_id = ?)' : ''}
       ORDER BY c.added_at DESC, c.id DESC`,
    )
    .all(...(groupId ? [c.get('user').id, groupId] : [c.get('user').id]))
  return c.json({ copies: rows.map(withIds) })
})

const addSchema = z.object({
  releaseId: z.number().int().positive(),
  mediaCondition: condition.optional(),
  sleeveCondition: condition.optional(),
  notes: z.string().max(2000).optional(),
})

collectionRoutes.post('/', async (c) => {
  const parsed = addSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
  const { releaseId, mediaCondition, sleeveCondition, notes } = parsed.data
  try {
    await ensureRelease(releaseId)
  } catch (err) {
    if (err instanceof DiscogsError) return c.json({ error: err.message }, err.status === 404 ? 404 : 502)
    throw err
  }
  const userId = c.get('user').id
  // Owning a record takes it off the wishlist.
  const info = db.transaction(() => {
    db.prepare('DELETE FROM wishlist WHERE user_id = ? AND release_id = ?').run(userId, releaseId)
    return db
      .prepare(
        'INSERT INTO copies (user_id, release_id, media_condition, sleeve_condition, notes) VALUES (?, ?, ?, ?, ?)',
      )
      .run(userId, releaseId, mediaCondition ?? null, sleeveCondition ?? null, notes ?? null)
  })()
  const copy = withIds(db.prepare(`${COPY_SELECT} WHERE c.id = ?`).get(info.lastInsertRowid))
  return c.json({ copy }, 201)
})

const patchSchema = z
  .object({ mediaCondition: condition, sleeveCondition: condition, notes: z.string().max(2000).nullable() })
  .partial()

collectionRoutes.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const parsed = patchSchema.safeParse(await c.req.json().catch(() => null))
  if (!Number.isInteger(id) || !parsed.success) return c.json({ error: 'Invalid request' }, 400)
  const owned = db.prepare('SELECT 1 FROM copies WHERE id = ? AND user_id = ?').get(id, c.get('user').id)
  if (!owned) return c.json({ error: 'Copy not found' }, 404)

  const { mediaCondition, sleeveCondition, notes } = parsed.data
  if (mediaCondition !== undefined) db.prepare('UPDATE copies SET media_condition = ? WHERE id = ?').run(mediaCondition, id)
  if (sleeveCondition !== undefined) db.prepare('UPDATE copies SET sleeve_condition = ? WHERE id = ?').run(sleeveCondition, id)
  if (notes !== undefined) db.prepare('UPDATE copies SET notes = ? WHERE id = ?').run(notes, id)
  return c.json({ copy: withIds(db.prepare(`${COPY_SELECT} WHERE c.id = ?`).get(id)) })
})

collectionRoutes.delete('/:id', (c) => {
  const res = db
    .prepare('DELETE FROM copies WHERE id = ? AND user_id = ?')
    .run(Number(c.req.param('id')), c.get('user').id)
  return res.changes ? c.json({ ok: true }) : c.json({ error: 'Copy not found' }, 404)
})

releaseRoutes.get('/:id/cover', (c) => {
  const id = Number(c.req.param('id'))
  const file = coverPath(id)
  if (!Number.isInteger(id) || !fs.existsSync(file)) return c.json({ error: 'No cover' }, 404)
  return c.body(fs.readFileSync(file), 200, {
    'Content-Type': 'image/jpeg',
    'Cache-Control': 'private, max-age=31536000, immutable',
  })
})

releaseRoutes.get('/:id', (c) => {
  const id = Number(c.req.param('id'))
  const r = db
    .prepare(
      `SELECT id, master_id AS masterId, title, artist, year, country, label, catno, barcode, format,
              genres, styles, tracklist, notes, has_cover AS hasCover
       FROM releases WHERE id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined
  if (!r) return c.json({ error: 'Release not found' }, 404)
  const copies = db
    .prepare(
      `SELECT id AS copyId, media_condition AS mediaCondition, sleeve_condition AS sleeveCondition,
              notes, added_at AS addedAt,
              (SELECT group_concat(collection_id) FROM collection_copies WHERE copy_id = copies.id) AS collectionIds
       FROM copies WHERE release_id = ? AND user_id = ? ORDER BY id`,
    )
    .all(id, c.get('user').id)
    .map(withIds)
  const wishlisted = db
    .prepare('SELECT id, notes FROM wishlist WHERE release_id = ? AND user_id = ?')
    .get(id, c.get('user').id)
  return c.json({
    wishlisted: wishlisted ?? null,
    release: {
      ...r,
      genres: JSON.parse(r.genres as string),
      styles: JSON.parse(r.styles as string),
      tracklist: JSON.parse(r.tracklist as string),
    },
    copies,
  })
})
