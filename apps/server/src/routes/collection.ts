import fs from 'node:fs'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireUser, type AppEnv } from '../auth.js'
import { db } from '../db.js'
import { DiscogsError } from '../discogs.js'
import { logEvent } from '../events.js'
import { triviaFor } from '../trivia.js'
import { canAccessRelease, coverFile, createManualRelease, deleteManualRelease, ensureRelease, isCreator, updateManualRelease } from '../releases.js'

export const collectionRoutes = new Hono<AppEnv>()
export const releaseRoutes = new Hono<AppEnv>()
collectionRoutes.use('*', requireUser)
releaseRoutes.use('*', requireUser)

// Discogs/Goldmine grading scale
const condition = z.enum(['M', 'NM', 'VG+', 'VG', 'G+', 'G', 'F', 'P']).nullable()

const COPY_SELECT = `
  SELECT c.id AS copyId, c.release_id AS releaseId, c.media_condition AS mediaCondition,
         c.sleeve_condition AS sleeveCondition, c.notes, c.added_at AS addedAt,
         c.for_sale AS forSale, c.asking_price AS askingPrice, c.price_currency AS priceCurrency,
         c.user_id AS ownerId, c.co_owner_id AS coOwnerId,
         (SELECT name FROM users WHERE id = c.user_id) AS ownerName,
         (SELECT name FROM users WHERE id = c.co_owner_id) AS coOwnerName,
         r.title, r.artist, r.year, r.country, r.label, r.catno, r.format, r.barcode, r.has_cover AS hasCover,
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
  const forSale = c.req.query('forSale') === '1'
  const rows = db
    .prepare(
      `${COPY_SELECT} WHERE (c.user_id = ? OR c.co_owner_id = ?)
       ${groupId ? 'AND c.id IN (SELECT copy_id FROM collection_copies WHERE collection_id = ?)' : ''}
       ${forSale ? 'AND c.for_sale = 1' : ''}
       ORDER BY c.added_at DESC, c.id DESC`,
    )
    .all(...(groupId ? [c.get('user').id, c.get('user').id, groupId] : [c.get('user').id, c.get('user').id]))
  return c.json({ copies: rows.map(withIds) })
})

const addSchema = z.object({
  releaseId: z.number().int().refine((n) => n !== 0), // negative IDs are records added by hand
  mediaCondition: condition.optional(),
  sleeveCondition: condition.optional(),
  notes: z.string().max(2000).optional(),
})

collectionRoutes.post('/', async (c) => {
  const parsed = addSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
  const { releaseId, mediaCondition, sleeveCondition, notes } = parsed.data
  try {
    await ensureRelease(releaseId, c.get('user').id)
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
  logEvent(userId, 'added', releaseId)
  const copy = withIds(db.prepare(`${COPY_SELECT} WHERE c.id = ?`).get(info.lastInsertRowid))
  return c.json({ copy }, 201)
})

const patchSchema = z
  .object({
    mediaCondition: condition,
    sleeveCondition: condition,
    notes: z.string().max(2000).nullable(),
    forSale: z.boolean(),
    askingPrice: z.number().positive().max(1_000_000).nullable(),
    coOwnerId: z.number().int().positive().nullable(),
  })
  .partial()

collectionRoutes.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const parsed = patchSchema.safeParse(await c.req.json().catch(() => null))
  if (!Number.isInteger(id) || !parsed.success) return c.json({ error: 'Invalid request' }, 400)
  const me = c.get('user').id
  const copy = db.prepare('SELECT user_id AS ownerId, release_id AS releaseId, for_sale AS forSale FROM copies WHERE id = ? AND (user_id = ? OR co_owner_id = ?)').get(id, me, me) as { ownerId: number; releaseId: number; forSale: number } | undefined
  if (!copy) return c.json({ error: 'Copy not found' }, 404)

  const { mediaCondition, sleeveCondition, notes, forSale, askingPrice, coOwnerId } = parsed.data
  if (coOwnerId !== undefined) {
    if (copy.ownerId !== me) return c.json({ error: 'Only the person who added this copy can change who it is shared with' }, 403)
    if (coOwnerId !== null && (coOwnerId === me || !db.prepare('SELECT 1 FROM users WHERE id = ? AND disabled = 0').get(coOwnerId))) {
      return c.json({ error: 'Choose another friend to share this copy with' }, 400)
    }
    db.prepare('UPDATE copies SET co_owner_id = ? WHERE id = ?').run(coOwnerId, id)
  }
  if (mediaCondition !== undefined) db.prepare('UPDATE copies SET media_condition = ? WHERE id = ?').run(mediaCondition, id)
  if (sleeveCondition !== undefined) db.prepare('UPDATE copies SET sleeve_condition = ? WHERE id = ?').run(sleeveCondition, id)
  if (notes !== undefined) db.prepare('UPDATE copies SET notes = ? WHERE id = ?').run(notes, id)
  if (forSale !== undefined) {
    db.prepare('UPDATE copies SET for_sale = ? WHERE id = ?').run(forSale ? 1 : 0, id)
    if (forSale && !copy.forSale) logEvent(me, 'listed', copy.releaseId)
  }
  if (askingPrice !== undefined) {
    // The price is recorded in the owner's current currency so it stays meaningful if they switch later.
    db.prepare('UPDATE copies SET asking_price = ?, price_currency = ? WHERE id = ?').run(
      askingPrice,
      askingPrice === null ? null : c.get('user').currency,
      id,
    )
  }
  return c.json({ copy: withIds(db.prepare(`${COPY_SELECT} WHERE c.id = ?`).get(id)) })
})

// Selling a copy takes it out of the collection (for a shared copy, out of both) and tells friends it's gone.
collectionRoutes.post('/:id/sold', (c) => {
  const id = Number(c.req.param('id'))
  const me = c.get('user').id
  const copy = db.prepare('SELECT release_id AS releaseId FROM copies WHERE id = ? AND user_id = ?').get(id, me) as { releaseId: number } | undefined
  if (!copy) return c.json({ error: 'Copy not found' }, 404)
  db.transaction(() => {
    db.prepare('DELETE FROM copies WHERE id = ?').run(id)
    logEvent(me, 'sold', copy.releaseId)
  })()
  return c.json({ ok: true })
})

// The person who added a shared copy deletes it for both; the co-owner can only step away from it.
collectionRoutes.delete('/:id', (c) => {
  const id = Number(c.req.param('id'))
  const me = c.get('user').id
  const res = db.prepare('DELETE FROM copies WHERE id = ? AND user_id = ?').run(id, me)
  if (res.changes) return c.json({ ok: true })
  const left = db.prepare('UPDATE copies SET co_owner_id = NULL WHERE id = ? AND co_owner_id = ?').run(id, me)
  return left.changes ? c.json({ ok: true }) : c.json({ error: 'Copy not found' }, 404)
})

const text = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null)
const manualSchema = z.object({
  title: z.string().trim().min(1).max(200),
  artist: z.string().trim().min(1).max(200),
  year: z.number().int().min(1850).max(2200).nullish().transform((v) => v ?? null),
  country: text(60),
  label: text(120),
  catno: text(60),
  barcode: text(40),
  format: text(120),
  genres: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  tracklist: z
    .array(z.object({ position: z.string().trim().max(10), title: z.string().trim().min(1).max(200), duration: z.string().trim().max(10).default('') }))
    .max(200)
    .default([]),
  notes: text(2000),
  // data: URL of a JPEG, resized by the browser first. On edit: omitted keeps the cover, null removes it.
  cover: z.string().max(4_000_000).nullish(),
  force: z.boolean().optional(), // skip the duplicate check
})

const validationMessage = (error: z.ZodError) => {
  const path = String(error.issues[0]?.path[0] ?? '')
  return path === 'title' || path === 'artist' ? 'Title and artist are required'
    : path === 'year' ? 'Year must be between 1850 and 2200'
    : path === 'tracklist' ? 'Check the tracklist (up to 200 tracks)'
    : 'Check the details you entered'
}

/** Decodes a cover data: URL; returns undefined for "keep", null for "remove", or an error string. */
function decodeCover(cover: string | null | undefined): Buffer | null | undefined | string {
  if (cover === undefined) return undefined
  if (!cover) return null
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(cover)
  return m ? Buffer.from(m[1]!, 'base64') : 'Cover must be a JPEG image'
}

// Records that aren't on Discogs. Add the copy or wishlist item afterwards with the returned releaseId.
releaseRoutes.post('/manual', async (c) => {
  const parsed = manualSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: validationMessage(parsed.error) }, 400)
  const { cover, force, ...rest } = parsed.data
  const userId = c.get('user').id
  if (!force) {
    const dupe = db
      .prepare('SELECT id FROM releases WHERE owner_id = ? AND id < 0 AND artist = ? COLLATE NOCASE AND title = ? COLLATE NOCASE')
      .get(userId, rest.artist, rest.title) as { id: number } | undefined
    if (dupe) return c.json({ error: `You already added “${rest.title}” by ${rest.artist}`, releaseId: dupe.id }, 409)
  }
  const image = decodeCover(cover)
  if (typeof image === 'string') return c.json({ error: image }, 400)
  return c.json({ releaseId: createManualRelease({ ...rest, cover: image ?? null }, userId) }, 201)
})

// Only the creator can edit or delete a record they added by hand.
const manualOwned = (id: number, userId: number) => Number.isInteger(id) && id < 0 && isCreator(id, userId)

releaseRoutes.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!manualOwned(id, c.get('user').id)) return c.json({ error: 'Release not found' }, 404)
  const parsed = manualSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: validationMessage(parsed.error) }, 400)
  const { cover, force: _force, ...rest } = parsed.data
  const image = decodeCover(cover)
  if (typeof image === 'string') return c.json({ error: image }, 400)
  updateManualRelease(id, rest, image)
  return c.json({ ok: true })
})

releaseRoutes.delete('/:id', (c) => {
  const id = Number(c.req.param('id'))
  if (!manualOwned(id, c.get('user').id)) return c.json({ error: 'Release not found' }, 404)
  deleteManualRelease(id)
  return c.json({ ok: true })
})

releaseRoutes.get('/:id/cover', async (c) => {
  const id = Number(c.req.param('id'))
  const file = Number.isInteger(id) && canAccessRelease(id, c.get('user').id) ? await coverFile(id, c.req.query('size') === 'thumb') : null
  if (!file) return c.json({ error: 'No cover' }, 404)
  return c.body(await fs.promises.readFile(file), 200, {
    'Content-Type': 'image/jpeg',
    // Discogs covers never change; a manual record's cover can be replaced when it is edited.
    'Cache-Control': id > 0 ? 'private, max-age=31536000, immutable' : 'private, no-cache',
  })
})

releaseRoutes.get('/:id/trivia', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || !canAccessRelease(id, c.get('user').id)) return c.json({ error: 'Release not found' }, 404)
  return c.json({ trivia: await triviaFor(id, c.get('user').id) })
})

releaseRoutes.get('/:id', (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || !canAccessRelease(id, c.get('user').id)) return c.json({ error: 'Release not found' }, 404)
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
              notes, added_at AS addedAt, for_sale AS forSale, asking_price AS askingPrice,
              price_currency AS priceCurrency, user_id AS ownerId, co_owner_id AS coOwnerId,
              (SELECT name FROM users WHERE id = copies.user_id) AS ownerName,
              (SELECT name FROM users WHERE id = copies.co_owner_id) AS coOwnerName,
              (SELECT group_concat(collection_id) FROM collection_copies WHERE copy_id = copies.id) AS collectionIds
       FROM copies WHERE release_id = ? AND (user_id = ? OR co_owner_id = ?) ORDER BY id`,
    )
    .all(id, c.get('user').id, c.get('user').id)
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
