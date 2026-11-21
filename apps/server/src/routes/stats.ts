import { Hono } from 'hono'
import { requireUser, type AppEnv } from '../auth.js'
import { db } from '../db.js'

export const statsRoutes = new Hono<AppEnv>()
statsRoutes.use('*', requireUser)

type Counted = { label: string; count: number }
const TOP = 10

/** Counts occurrences of each label, most frequent first. */
function tally(labels: Iterable<string>, limit = TOP): Counted[] {
  const counts = new Map<string, number>()
  for (const l of labels) if (l) counts.set(l, (counts.get(l) ?? 0) + 1)
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit)
}

const tags = (format: string | null) => (format ?? '').split(',').map((t) => t.trim()).filter(Boolean)
const genres = (json: string) => {
  try {
    return JSON.parse(json) as string[]
  } catch {
    return []
  }
}

statsRoutes.get('/', (c) => {
  const user = c.get('user')
  // One row per copy; everything below is aggregated from this in memory.
  const rows = db
    .prepare(
      `SELECT c.release_id AS releaseId, c.added_at AS addedAt, c.for_sale AS forSale, c.asking_price AS price,
              c.price_currency AS priceCurrency, r.title, r.artist, r.year, r.country, r.label, r.format, r.genres,
              r.has_cover AS hasCover
       FROM copies c JOIN releases r ON r.id = c.release_id WHERE (c.user_id = ? OR c.co_owner_id = ?) ORDER BY c.added_at DESC, c.id DESC`,
    )
    .all(user.id, user.id) as Array<{
    releaseId: number; addedAt: string; forSale: number; price: number | null; priceCurrency: string | null
    title: string; artist: string; year: number | null; country: string | null; label: string | null
    format: string | null; genres: string; hasCover: number
  }>
  const wishlist = (db.prepare('SELECT COUNT(*) AS n FROM wishlist WHERE user_id = ?').get(user.id) as { n: number }).n

  const decades = new Map<number, number>()
  for (const r of rows) if (r.year) decades.set(Math.floor(r.year / 10) * 10, (decades.get(Math.floor(r.year / 10) * 10) ?? 0) + 1)

  // Last 12 months, oldest first, including empty months so the chart has a steady axis.
  const months: Counted[] = []
  const today = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1))
    const key = d.toISOString().slice(0, 7)
    months.push({ label: key, count: rows.filter((r) => r.addedAt.startsWith(key)).length })
  }

  // Marketplace value: the lowest-listing prices Discogs reported, only for releases whose price was fetched
  // in the user's currency (it is cached when a record's marketplace line has been viewed).
  const copiesPerRelease = new Map<number, number>()
  for (const r of rows) if (r.releaseId > 0) copiesPerRelease.set(r.releaseId, (copiesPerRelease.get(r.releaseId) ?? 0) + 1)
  const prices = db
    .prepare('SELECT release_id AS releaseId, lowest_price AS price FROM market_stats WHERE currency = ? AND lowest_price IS NOT NULL')
    .all(user.currency) as Array<{ releaseId: number; price: number }>
  let estimated = 0
  let priced = 0
  for (const p of prices) {
    const n = copiesPerRelease.get(p.releaseId)
    if (n) {
      estimated += p.price * n
      priced++
    }
  }

  const forSale = new Map<string, { total: number; count: number }>()
  for (const r of rows) {
    if (!r.forSale) continue
    const cur = r.priceCurrency ?? user.currency
    const e = forSale.get(cur) ?? { total: 0, count: 0 }
    if (r.price != null) e.total += r.price
    e.count += r.price != null ? 1 : 0
    forSale.set(cur, e)
  }

  return c.json({
    copies: rows.length,
    releases: new Set(rows.map((r) => r.releaseId)).size,
    wishlist,
    forSale: rows.filter((r) => r.forSale).length,
    byDecade: [...decades].sort((a, b) => a[0] - b[0]).map(([d, count]) => ({ label: `${d}s`, count })),
    byFormat: tally(rows.flatMap((r) => tags(r.format))),
    byGenre: tally(rows.flatMap((r) => genres(r.genres))),
    byCountry: tally(rows.map((r) => r.country ?? '')),
    topArtists: tally(rows.map((r) => r.artist)),
    topLabels: tally(rows.map((r) => r.label ?? '')),
    addedByMonth: months,
    recent: rows.slice(0, 6).map((r) => ({ releaseId: r.releaseId, title: r.title, artist: r.artist, hasCover: r.hasCover })),
    value: {
      currency: user.currency,
      estimated: Math.round(estimated * 100) / 100,
      pricedReleases: priced,
      totalReleases: copiesPerRelease.size,
    },
    forSaleValue: [...forSale].map(([currency, v]) => ({ currency, ...v })),
  })
})
