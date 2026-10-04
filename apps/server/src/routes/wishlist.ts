import { Hono } from 'hono'
import { z } from 'zod'
import { requireUser, type AppEnv } from '../auth.js'
import { db } from '../db.js'
import { forgetWishRemoval, pushNewCopy, pushUnwishlisted, pushWishlisted, rememberWishRemoval } from '../discogsSync.js'
import { logEvent } from '../events.js'
import { DiscogsError, fetchMarketStats, marketCurrency } from '../discogs.js'
import { ensureRelease, TRACKS_SQL } from '../releases.js'

export const wishlistRoutes = new Hono<AppEnv>()
export const statusRoutes = new Hono<AppEnv>()
wishlistRoutes.use('*', requireUser)
statusRoutes.use('*', requireUser)

const grade = z.enum(['M', 'NM', 'VG+', 'VG', 'G+', 'G', 'F', 'P']).nullable()

const ITEM_SELECT = `
  SELECT w.id AS wishId, w.release_id AS releaseId, w.notes, w.added_at AS addedAt,
         r.title, r.artist, r.year, r.country, r.label, r.catno, r.format, r.barcode, r.has_cover AS hasCover, ${TRACKS_SQL}
  FROM wishlist w JOIN releases r ON r.id = w.release_id`

wishlistRoutes.get('/', (c) =>
  c.json({
    items: db.prepare(`${ITEM_SELECT} WHERE w.user_id = ? ORDER BY w.added_at DESC, w.id DESC`).all(c.get('user').id),
  }),
)

const addSchema = z.object({
  releaseId: z.number().int().refine((n) => n !== 0), // negative IDs are records added by hand
  notes: z.string().max(2000).optional(),
})

// Wishlisting a release that is already on the list is a no-op that returns the existing item.
wishlistRoutes.post('/', async (c) => {
  const parsed = addSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
  const { releaseId, notes } = parsed.data
  try {
    await ensureRelease(releaseId, c.get('user').id)
  } catch (err) {
    if (err instanceof DiscogsError) return c.json({ error: err.message }, err.status === 404 ? 404 : 502)
    throw err
  }
  const userId = c.get('user').id
  const info = db
    .prepare('INSERT OR IGNORE INTO wishlist (user_id, release_id, notes) VALUES (?, ?, ?)')
    .run(userId, releaseId, notes ?? null)
  forgetWishRemoval(userId, releaseId)
  if (info.changes) {
    logEvent(userId, 'wishlisted', releaseId)
    pushWishlisted(userId, releaseId, notes)
  }
  const item = db.prepare(`${ITEM_SELECT} WHERE w.user_id = ? AND w.release_id = ?`).get(userId, releaseId)
  return c.json({ item }, info.changes ? 201 : 200)
})

wishlistRoutes.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const parsed = z.object({ notes: z.string().max(2000).nullable() }).safeParse(await c.req.json().catch(() => null))
  if (!Number.isInteger(id) || !parsed.success) return c.json({ error: 'Invalid request' }, 400)
  const res = db
    .prepare('UPDATE wishlist SET notes = ? WHERE id = ? AND user_id = ?')
    .run(parsed.data.notes, id, c.get('user').id)
  if (!res.changes) return c.json({ error: 'Wishlist item not found' }, 404)
  return c.json({ item: db.prepare(`${ITEM_SELECT} WHERE w.id = ?`).get(id) })
})

wishlistRoutes.delete('/:id', (c) => {
  const id = Number(c.req.param('id'))
  const userId = c.get('user').id
  const item = db.prepare('SELECT release_id AS releaseId FROM wishlist WHERE id = ? AND user_id = ?').get(id, userId) as { releaseId: number } | undefined
  if (item) rememberWishRemoval(userId, item.releaseId)
  const res = db.prepare('DELETE FROM wishlist WHERE id = ? AND user_id = ?').run(id, userId)
  return res.changes ? c.json({ ok: true }) : c.json({ error: 'Wishlist item not found' }, 404)
})

// "Got it": moves a wishlisted release into the collection as a new copy.
const acquireSchema = z.object({ mediaCondition: grade.optional(), sleeveCondition: grade.optional() })

wishlistRoutes.post('/:id/acquire', async (c) => {
  const id = Number(c.req.param('id'))
  const parsed = acquireSchema.safeParse(await c.req.json().catch(() => ({})))
  if (!Number.isInteger(id) || !parsed.success) return c.json({ error: 'Invalid request' }, 400)
  const userId = c.get('user').id

  const copyId = db.transaction(() => {
    const item = db
      .prepare('SELECT release_id AS releaseId, notes FROM wishlist WHERE id = ? AND user_id = ?')
      .get(id, userId) as { releaseId: number; notes: string | null } | undefined
    if (!item) return null
    const info = db
      .prepare(
        'INSERT INTO copies (user_id, release_id, media_condition, sleeve_condition, notes) VALUES (?, ?, ?, ?, ?)',
      )
      .run(userId, item.releaseId, parsed.data.mediaCondition ?? null, parsed.data.sleeveCondition ?? null, item.notes)
    rememberWishRemoval(userId, item.releaseId)
    db.prepare('DELETE FROM wishlist WHERE id = ?').run(id)
    return Number(info.lastInsertRowid)
  })()

  if (copyId === null) return c.json({ error: 'Wishlist item not found' }, 404)
  const acquired = db.prepare('SELECT release_id AS releaseId FROM copies WHERE id = ?').get(copyId) as { releaseId: number }
  logEvent(userId, 'added', acquired.releaseId)
  pushNewCopy(userId, copyId)
  pushUnwishlisted(userId, acquired.releaseId)
  return c.json({ copyId }, 201)
})

// For marking search results: which of these releases do I own / have wishlisted?
statusRoutes.get('/', (c) => {
  const ids = (c.req.query('ids') ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 100)
  if (!ids.length) return c.json({ owned: {}, wishlisted: [] })
  const marks = ids.map(() => '?').join(',')
  const userId = c.get('user').id
  const owned = db
    .prepare(`SELECT release_id AS id, COUNT(*) AS n FROM copies WHERE (user_id = ? OR co_owner_id = ?) AND release_id IN (${marks}) GROUP BY release_id`)
    .all(userId, userId, ...ids) as Array<{ id: number; n: number }>
  const wished = db
    .prepare(`SELECT release_id AS id FROM wishlist WHERE user_id = ? AND release_id IN (${marks})`)
    .all(userId, ...ids) as Array<{ id: number }>
  return c.json({
    owned: Object.fromEntries(owned.map((o) => [o.id, o.n])),
    wishlisted: wished.map((w) => w.id),
  })
})

// Market stats are cached per release and currency; refetched once they are older than the TTL.
const MARKET_TTL_MS = 6 * 3_600_000

export const marketRoutes = new Hono<AppEnv>()
marketRoutes.use('*', requireUser)

marketRoutes.get('/:releaseId', async (c) => {
  const releaseId = Number(c.req.param('releaseId'))
  if (!Number.isInteger(releaseId) || releaseId <= 0) return c.json({ error: 'Invalid release' }, 400)
  const currency = marketCurrency(c.get('user').currency)
  const url = `https://www.discogs.com/sell/release/${releaseId}`

  const row = db
    .prepare('SELECT num_for_sale AS numForSale, lowest_price AS lowestPrice, fetched_at AS fetchedAt FROM market_stats WHERE release_id = ? AND currency = ?')
    .get(releaseId, currency) as { numForSale: number; lowestPrice: number | null; fetchedAt: number } | undefined
  if (row && Date.now() - row.fetchedAt < MARKET_TTL_MS) return c.json({ ...row, currency, url })

  try {
    const stats = await fetchMarketStats(releaseId, currency)
    const fetchedAt = Date.now()
    db.prepare(
      'INSERT OR REPLACE INTO market_stats (release_id, currency, num_for_sale, lowest_price, fetched_at) VALUES (?, ?, ?, ?, ?)',
    ).run(releaseId, currency, stats.numForSale, stats.lowestPrice, fetchedAt)
    return c.json({ ...stats, fetchedAt, currency, url })
  } catch (err) {
    // Serve stale numbers rather than nothing if Discogs is unreachable.
    if (row) return c.json({ ...row, currency, url, stale: true })
    if (err instanceof DiscogsError) return c.json({ error: err.message }, 502)
    throw err
  }
})
