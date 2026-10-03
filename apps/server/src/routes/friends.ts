import fs from 'node:fs'
import { Hono } from 'hono'
import { requireUser, type AppEnv } from '../auth.js'
import { db } from '../db.js'
import { coverFile, TRACKS_SQL } from '../releases.js'

// Read-only browsing of other friends' collections. Each friend opts in on their Account page; grades,
// notes and prices are never included here.
export const friendRoutes = new Hono<AppEnv>()
friendRoutes.use('*', requireUser)

interface Friend {
  id: number
  name: string
  collection: number
  wishlist: number
}

const findFriend = (id: number, viewerId: number) =>
  Number.isInteger(id) && id !== viewerId
    ? (db
        .prepare(
          `SELECT id, name, share_collection AS collection, share_wishlist AS wishlist
           FROM users WHERE id = ? AND disabled = 0 AND (share_collection = 1 OR share_wishlist = 1)`,
        )
        .get(id) as Friend | undefined)
    : undefined

// Everyone else who can be picked as a co-owner of a copy (names only).
friendRoutes.get('/users', (c) =>
  c.json({ users: db.prepare('SELECT id, name FROM users WHERE disabled = 0 AND id != ? ORDER BY name COLLATE NOCASE').all(c.get('user').id) }),
)

friendRoutes.get('/', (c) => {
  const friends = db
    .prepare(
      `SELECT u.id, u.name, u.share_collection AS collection, u.share_wishlist AS wishlist,
              CASE WHEN u.share_collection = 1
                   THEN (SELECT COUNT(*) FROM copies WHERE user_id = u.id OR co_owner_id = u.id) END AS records
       FROM users u WHERE u.disabled = 0 AND u.id != ? AND (u.share_collection = 1 OR u.share_wishlist = 1)
       ORDER BY u.name COLLATE NOCASE`,
    )
    .all(c.get('user').id)
  return c.json({ friends })
})

// What friends have recently added, wishlisted, put up for sale and sold. Only what each friend shares:
// wishlist events need the wishlist setting, the rest need the collection setting, and everyone can opt out
// of the feed entirely. No prices or grades.
friendRoutes.get('/feed', (c) => {
  const events = db
    .prepare(
      `SELECT e.id, e.type, e.created_at AS createdAt, u.id AS userId, u.name AS userName,
              r.id AS releaseId, r.title, r.artist, r.has_cover AS hasCover
       FROM events e JOIN users u ON u.id = e.user_id JOIN releases r ON r.id = e.release_id
       WHERE e.user_id != ? AND u.disabled = 0 AND u.share_activity = 1
         AND ((e.type = 'wishlisted' AND u.share_wishlist = 1) OR (e.type != 'wishlisted' AND u.share_collection = 1))
       ORDER BY e.created_at DESC, e.id DESC LIMIT 40`,
    )
    .all(c.get('user').id)
  return c.json({ events })
})

const ITEM_COLUMNS = `r.id AS releaseId, r.title, r.artist, r.year, r.country, r.label, r.catno, r.format,
                      r.has_cover AS hasCover, ${TRACKS_SQL}`
const ORDER = 'ORDER BY r.artist COLLATE NOCASE, r.year, r.title COLLATE NOCASE'

friendRoutes.get('/:id', (c) => {
  const friend = findFriend(Number(c.req.param('id')), c.get('user').id)
  if (!friend) return c.json({ error: 'Friend not found' }, 404)
  const collection = friend.collection
    ? db
        .prepare(
          `SELECT ${ITEM_COLUMNS}, COUNT(*) AS copies,
                  MAX(c.co_owner_id IS NOT NULL) AS shared
           FROM copies c JOIN releases r ON r.id = c.release_id
           WHERE c.user_id = ? OR c.co_owner_id = ? GROUP BY r.id ${ORDER}`,
        )
        .all(friend.id, friend.id)
    : null
  const wishlist = friend.wishlist
    ? db
        .prepare(`SELECT ${ITEM_COLUMNS}, 1 AS copies FROM wishlist w JOIN releases r ON r.id = w.release_id WHERE w.user_id = ? ${ORDER}`)
        .all(friend.id)
    : null
  return c.json({ name: friend.name, collection, wishlist })
})

friendRoutes.get('/:id/cover/:releaseId', async (c) => {
  const friend = findFriend(Number(c.req.param('id')), c.get('user').id)
  const releaseId = Number(c.req.param('releaseId'))
  const visible =
    !!friend &&
    Number.isInteger(releaseId) &&
    ((friend.collection && db.prepare('SELECT 1 FROM copies WHERE release_id = ? AND (user_id = ? OR co_owner_id = ?)').get(releaseId, friend.id, friend.id)) ||
      (friend.wishlist && db.prepare('SELECT 1 FROM wishlist WHERE release_id = ? AND user_id = ?').get(releaseId, friend.id)))
  const file = visible ? await coverFile(releaseId, c.req.query('size') === 'thumb') : null
  if (!file) return c.json({ error: 'No cover' }, 404)
  return c.body(await fs.promises.readFile(file), 200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' })
})
