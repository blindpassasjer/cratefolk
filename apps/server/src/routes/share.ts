import crypto from 'node:crypto'
import fs from 'node:fs'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireUser, type AppEnv } from '../auth.js'
import { db } from '../db.js'
import { coverPath } from '../releases.js'

type Kind = 'all' | 'group' | 'wishlist' | 'forsale'

// ---- Managing links (signed in) ----------------------------------------------------------

export const shareRoutes = new Hono<AppEnv>()
shareRoutes.use('*', requireUser)

const targetSchema = z.object({
  kind: z.enum(['all', 'group', 'wishlist', 'forsale']),
  collectionId: z.number().int().positive().optional(),
})

function groupIdOf(kind: Kind, collectionId: number | undefined): number | null {
  return kind === 'group' ? (collectionId ?? null) : null
}

shareRoutes.get('/', (c) => {
  const parsed = targetSchema.safeParse({
    kind: c.req.query('kind'),
    collectionId: c.req.query('collection') ? Number(c.req.query('collection')) : undefined,
  })
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
  const share = db
    .prepare('SELECT token FROM shares WHERE user_id = ? AND kind = ? AND COALESCE(group_id, 0) = ?')
    .get(c.get('user').id, parsed.data.kind, groupIdOf(parsed.data.kind, parsed.data.collectionId) ?? 0)
  return c.json({ share: share ?? null })
})

shareRoutes.post('/', async (c) => {
  const parsed = targetSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
  const userId = c.get('user').id
  const { kind, collectionId } = parsed.data
  const groupId = groupIdOf(kind, collectionId)

  if (kind === 'group') {
    if (!groupId || !db.prepare('SELECT 1 FROM collections WHERE id = ? AND user_id = ?').get(groupId, userId)) {
      return c.json({ error: 'Crate not found' }, 404)
    }
  }
  const existing = db
    .prepare('SELECT token FROM shares WHERE user_id = ? AND kind = ? AND COALESCE(group_id, 0) = ?')
    .get(userId, kind, groupId ?? 0) as { token: string } | undefined
  if (existing) return c.json({ share: existing })

  const token = crypto.randomBytes(18).toString('base64url')
  db.prepare('INSERT INTO shares (token, user_id, kind, group_id) VALUES (?, ?, ?, ?)').run(token, userId, kind, groupId)
  return c.json({ share: { token } }, 201)
})

shareRoutes.delete('/:token', (c) => {
  const res = db.prepare('DELETE FROM shares WHERE token = ? AND user_id = ?').run(c.req.param('token'), c.get('user').id)
  return res.changes ? c.json({ ok: true }) : c.json({ error: 'Share not found' }, 404)
})

// ---- Viewing a link (public, no sign-in) -------------------------------------------------

export const publicShareRoutes = new Hono()

interface ShareRow {
  user_id: number
  kind: Kind
  group_id: number | null
  owner: string
}

const lookup = (token: string) =>
  db
    .prepare(
      `SELECT s.user_id, s.kind, s.group_id, u.name AS owner
       FROM shares s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND u.disabled = 0`,
    )
    .get(token) as ShareRow | undefined

const ITEM_COLUMNS = `r.id AS releaseId, r.title, r.artist, r.year, r.country, r.label, r.catno, r.format,
                      r.has_cover AS hasCover`

function itemsFor(share: ShareRow) {
  if (share.kind === 'wishlist') {
    return db
      .prepare(`SELECT ${ITEM_COLUMNS}, 1 AS copies FROM wishlist w JOIN releases r ON r.id = w.release_id
                WHERE w.user_id = ? ORDER BY r.artist COLLATE NOCASE, r.year, r.title COLLATE NOCASE`)
      .all(share.user_id)
  }
  if (share.kind === 'forsale') {
    // One entry per copy, since grade and price differ between copies. Copy notes stay private.
    return db
      .prepare(
        `SELECT ${ITEM_COLUMNS}, 1 AS copies, c.id AS copyId, c.media_condition AS mediaCondition,
                c.sleeve_condition AS sleeveCondition, c.asking_price AS askingPrice, c.price_currency AS priceCurrency
         FROM copies c JOIN releases r ON r.id = c.release_id
         WHERE c.user_id = ? AND c.for_sale = 1
         ORDER BY r.artist COLLATE NOCASE, r.year, r.title COLLATE NOCASE, c.id`,
      )
      .all(share.user_id)
  }
  // Several copies of one pressing show once, with a count. Notes, grades and prices stay private.
  return db
    .prepare(
      `SELECT ${ITEM_COLUMNS}, COUNT(*) AS copies
       FROM copies c JOIN releases r ON r.id = c.release_id
       WHERE c.user_id = ?
       ${share.kind === 'group' ? 'AND c.id IN (SELECT copy_id FROM collection_copies WHERE collection_id = ?)' : ''}
       GROUP BY r.id ORDER BY r.artist COLLATE NOCASE, r.year, r.title COLLATE NOCASE`,
    )
    .all(...(share.kind === 'group' ? [share.user_id, share.group_id] : [share.user_id]))
}

publicShareRoutes.get('/:token', (c) => {
  const share = lookup(c.req.param('token'))
  if (!share) return c.json({ error: 'This link is no longer available' }, 404)
  let title = 'Collection'
  if (share.kind === 'wishlist') title = 'Wishlist'
  if (share.kind === 'forsale') title = 'For sale'
  if (share.kind === 'group') {
    title = (db.prepare('SELECT name FROM collections WHERE id = ?').get(share.group_id) as { name: string }).name
  }
  return c.json(
    { title, owner: share.owner, kind: share.kind, items: itemsFor(share) },
    200,
    { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  )
})

/** Whether a release is part of the shared set, without building the whole item list. */
function inShare(share: ShareRow, releaseId: number): boolean {
  const q = (sql: string, ...args: unknown[]) => !!db.prepare(sql).get(...args)
  if (share.kind === 'wishlist') return q('SELECT 1 FROM wishlist WHERE user_id = ? AND release_id = ?', share.user_id, releaseId)
  if (share.kind === 'forsale') return q('SELECT 1 FROM copies WHERE user_id = ? AND release_id = ? AND for_sale = 1', share.user_id, releaseId)
  if (share.kind === 'group') {
    return q(
      'SELECT 1 FROM copies c JOIN collection_copies cc ON cc.copy_id = c.id WHERE c.user_id = ? AND c.release_id = ? AND cc.collection_id = ?',
      share.user_id, releaseId, share.group_id,
    )
  }
  return q('SELECT 1 FROM copies WHERE user_id = ? AND release_id = ?', share.user_id, releaseId)
}

publicShareRoutes.get('/:token/cover/:releaseId', (c) => {
  const share = lookup(c.req.param('token'))
  const releaseId = Number(c.req.param('releaseId'))
  // Only covers of records that are actually in the shared set can be fetched.
  if (!share || !Number.isInteger(releaseId) || !inShare(share, releaseId)) {
    return c.json({ error: 'Not found' }, 404)
  }
  const file = coverPath(releaseId)
  if (!fs.existsSync(file)) return c.json({ error: 'No cover' }, 404)
  return c.body(fs.readFileSync(file), 200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' })
})
