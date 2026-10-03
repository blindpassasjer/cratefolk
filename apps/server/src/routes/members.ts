import fs from 'node:fs'
import { Hono } from 'hono'
import { requireUser, type AppEnv } from '../auth.js'
import { db } from '../db.js'
import { coverPath } from '../releases.js'

// Read-only browsing of other members' collections. Each member opts in on their Account page; grades,
// notes and prices are never included here.
export const memberRoutes = new Hono<AppEnv>()
memberRoutes.use('*', requireUser)

interface Member {
  id: number
  name: string
  collection: number
  wishlist: number
}

const findMember = (id: number, viewerId: number) =>
  Number.isInteger(id) && id !== viewerId
    ? (db
        .prepare(
          `SELECT id, name, share_collection AS collection, share_wishlist AS wishlist
           FROM users WHERE id = ? AND disabled = 0 AND (share_collection = 1 OR share_wishlist = 1)`,
        )
        .get(id) as Member | undefined)
    : undefined

// Everyone else who can be picked as a co-owner of a copy (names only).
memberRoutes.get('/users', (c) =>
  c.json({ users: db.prepare('SELECT id, name FROM users WHERE disabled = 0 AND id != ? ORDER BY name COLLATE NOCASE').all(c.get('user').id) }),
)

memberRoutes.get('/', (c) => {
  const members = db
    .prepare(
      `SELECT u.id, u.name, u.share_collection AS collection, u.share_wishlist AS wishlist,
              CASE WHEN u.share_collection = 1
                   THEN (SELECT COUNT(*) FROM copies WHERE user_id = u.id OR co_owner_id = u.id) END AS records
       FROM users u WHERE u.disabled = 0 AND u.id != ? AND (u.share_collection = 1 OR u.share_wishlist = 1)
       ORDER BY u.name COLLATE NOCASE`,
    )
    .all(c.get('user').id)
  return c.json({ members })
})

const ITEM_COLUMNS = `r.id AS releaseId, r.title, r.artist, r.year, r.country, r.label, r.catno, r.format,
                      r.has_cover AS hasCover`
const ORDER = 'ORDER BY r.artist COLLATE NOCASE, r.year, r.title COLLATE NOCASE'

memberRoutes.get('/:id', (c) => {
  const member = findMember(Number(c.req.param('id')), c.get('user').id)
  if (!member) return c.json({ error: 'Member not found' }, 404)
  const collection = member.collection
    ? db
        .prepare(
          `SELECT ${ITEM_COLUMNS}, COUNT(*) AS copies,
                  MAX(c.co_owner_id IS NOT NULL) AS shared
           FROM copies c JOIN releases r ON r.id = c.release_id
           WHERE c.user_id = ? OR c.co_owner_id = ? GROUP BY r.id ${ORDER}`,
        )
        .all(member.id, member.id)
    : null
  const wishlist = member.wishlist
    ? db
        .prepare(`SELECT ${ITEM_COLUMNS}, 1 AS copies FROM wishlist w JOIN releases r ON r.id = w.release_id WHERE w.user_id = ? ${ORDER}`)
        .all(member.id)
    : null
  return c.json({ name: member.name, collection, wishlist })
})

memberRoutes.get('/:id/cover/:releaseId', (c) => {
  const member = findMember(Number(c.req.param('id')), c.get('user').id)
  const releaseId = Number(c.req.param('releaseId'))
  const visible =
    !!member &&
    Number.isInteger(releaseId) &&
    ((member.collection && db.prepare('SELECT 1 FROM copies WHERE release_id = ? AND (user_id = ? OR co_owner_id = ?)').get(releaseId, member.id, member.id)) ||
      (member.wishlist && db.prepare('SELECT 1 FROM wishlist WHERE release_id = ? AND user_id = ?').get(releaseId, member.id)))
  const file = coverPath(releaseId)
  if (!visible || !fs.existsSync(file)) return c.json({ error: 'No cover' }, 404)
  return c.body(fs.readFileSync(file), 200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' })
})
