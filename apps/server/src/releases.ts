import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { db } from './db.js'
import { downloadImage, fetchRelease } from './discogs.js'

const coversDir = path.join(config.dataDir, 'covers')
fs.mkdirSync(coversDir, { recursive: true })

export const coverPath = (id: number) => path.join(coversDir, `${id}.jpg`)

/** Returns once the release is in the local cache, fetching it from Discogs on first use. */
export async function ensureRelease(id: number): Promise<void> {
  if (db.prepare('SELECT 1 FROM releases WHERE id = ?').get(id)) return

  const r = await fetchRelease(id)
  const image = r.coverUrl ? await downloadImage(r.coverUrl) : null
  if (image) fs.writeFileSync(coverPath(id), image)

  db.prepare(
    `INSERT OR REPLACE INTO releases
       (id, master_id, title, artist, year, country, label, catno, barcode, format,
        genres, styles, tracklist, notes, has_cover)
     VALUES (@id, @masterId, @title, @artist, @year, @country, @label, @catno, @barcode, @format,
        @genres, @styles, @tracklist, @notes, @hasCover)`,
  ).run({
    ...r,
    genres: JSON.stringify(r.genres),
    styles: JSON.stringify(r.styles),
    tracklist: JSON.stringify(r.tracklist),
    hasCover: image ? 1 : 0,
  })
}
