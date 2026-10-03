import ExcelJS from 'exceljs'
import { Hono } from 'hono'
import { requireUser, type AppEnv } from '../auth.js'
import { db } from '../db.js'

export const exportRoutes = new Hono<AppEnv>()
exportRoutes.use('*', requireUser)

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const joinJson = (value: unknown) => (JSON.parse(String(value ?? '[]')) as string[]).join(', ')
const discogsUrl = (id: number) => (id > 0 ? `https://www.discogs.com/release/${id}` : '')
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export'

interface Column {
  header: string
  key: string
  width: number
}

async function sheet(name: string, columns: Column[], rows: Array<Record<string, unknown>>): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Cratelog'
  const ws = wb.addWorksheet(name)
  ws.columns = columns
  ws.addRows(rows)
  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

const download = (c: { body: (d: ArrayBuffer, s: 200, h: Record<string, string>) => Response }, data: ArrayBuffer, name: string) =>
  c.body(data, 200, {
    'Content-Type': XLSX,
    'Content-Disposition': `attachment; filename="cratelog-${name}-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    'Cache-Control': 'no-store',
  })

const COMMON: Column[] = [
  { header: 'Artist', key: 'artist', width: 28 },
  { header: 'Title', key: 'title', width: 36 },
  { header: 'Year', key: 'year', width: 8 },
  { header: 'Country', key: 'country', width: 14 },
  { header: 'Label', key: 'label', width: 24 },
  { header: 'Catalog #', key: 'catno', width: 16 },
  { header: 'Format', key: 'format', width: 34 },
  { header: 'Barcode', key: 'barcode', width: 18 },
  { header: 'Genres', key: 'genres', width: 24 },
  { header: 'Styles', key: 'styles', width: 24 },
]
const TAIL: Column[] = [
  { header: 'Added', key: 'added', width: 12 },
  { header: 'Discogs ID', key: 'releaseId', width: 12 },
  { header: 'Discogs link', key: 'link', width: 44 },
]

interface Row {
  releaseId: number
  genres: string
  styles: string
  [k: string]: unknown
}

const shape = (r: Row) => ({
  ...r,
  releaseId: r.releaseId > 0 ? r.releaseId : '', // manual records have no Discogs ID
  genres: joinJson(r.genres),
  styles: joinJson(r.styles),
  link: discogsUrl(r.releaseId) ? { text: discogsUrl(r.releaseId), hyperlink: discogsUrl(r.releaseId) } : '',
})

// All owned records, or just one collection with ?collection=ID, or only copies for sale with ?forSale=1.
exportRoutes.get('/collection.xlsx', async (c) => {
  const userId = c.get('user').id
  const groupId = Number(c.req.query('collection')) || null
  const forSale = c.req.query('forSale') === '1'
  let name = forSale ? 'for-sale' : 'collection'
  if (groupId) {
    const g = db.prepare('SELECT name FROM collections WHERE id = ? AND user_id = ?').get(groupId, userId) as { name: string } | undefined
    if (!g) return c.json({ error: 'Crate not found' }, 404)
    name = slug(g.name) + (forSale ? '-for-sale' : '')
  }
  const rows = db
    .prepare(
      `SELECT r.id AS releaseId, r.artist, r.title, r.year, r.country, r.label, r.catno, r.format, r.barcode,
              r.genres, r.styles, c.media_condition AS media, c.sleeve_condition AS sleeve, c.notes,
              CASE WHEN c.for_sale THEN 'Yes' ELSE '' END AS forSale, c.asking_price AS price, c.price_currency AS currency,
              substr(c.added_at, 1, 10) AS added,
              (SELECT group_concat(g.name, ', ') FROM collection_copies cc JOIN collections g ON g.id = cc.collection_id
               WHERE cc.copy_id = c.id) AS collections
       FROM copies c JOIN releases r ON r.id = c.release_id
       WHERE (c.user_id = ? OR c.co_owner_id = ?)
       ${groupId ? 'AND c.id IN (SELECT copy_id FROM collection_copies WHERE collection_id = ?)' : ''}
       ${forSale ? 'AND c.for_sale = 1' : ''}
       ORDER BY r.artist COLLATE NOCASE, r.year, r.title COLLATE NOCASE`,
    )
    .all(...(groupId ? [userId, userId, groupId] : [userId, userId])) as Row[]

  const columns: Column[] = [
    ...COMMON,
    { header: 'Media', key: 'media', width: 8 },
    { header: 'Sleeve', key: 'sleeve', width: 8 },
    { header: 'For sale', key: 'forSale', width: 9 },
    { header: 'Asking price', key: 'price', width: 13 },
    { header: 'Currency', key: 'currency', width: 9 },
    { header: 'Collections', key: 'collections', width: 24 },
    { header: 'Notes', key: 'notes', width: 36 },
    ...TAIL,
  ]
  return download(c, await sheet('Collection', columns, rows.map(shape)), name)
})

exportRoutes.get('/wishlist.xlsx', async (c) => {
  const rows = db
    .prepare(
      `SELECT r.id AS releaseId, r.artist, r.title, r.year, r.country, r.label, r.catno, r.format, r.barcode,
              r.genres, r.styles, w.notes, substr(w.added_at, 1, 10) AS added
       FROM wishlist w JOIN releases r ON r.id = w.release_id
       WHERE w.user_id = ? ORDER BY r.artist COLLATE NOCASE, r.year, r.title COLLATE NOCASE`,
    )
    .all(c.get('user').id) as Row[]
  const columns: Column[] = [...COMMON, { header: 'Notes', key: 'notes', width: 36 }, ...TAIL]
  return download(c, await sheet('Wishlist', columns, rows.map(shape)), 'wishlist')
})
