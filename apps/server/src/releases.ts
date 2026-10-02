import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { db } from './db.js'
import { DiscogsError, downloadImage, fetchRelease } from './discogs.js'

const coversDir = path.join(config.dataDir, 'covers')
fs.mkdirSync(coversDir, { recursive: true })

export const coverPath = (id: number) => path.join(coversDir, `${id}.jpg`)

/** Returns once the release is in the local cache, fetching it from Discogs on first use. */
export async function ensureRelease(id: number): Promise<void> {
  if (db.prepare('SELECT 1 FROM releases WHERE id = ?').get(id)) return
  // Manually entered records have negative IDs and don't exist on Discogs.
  if (id < 0) throw new DiscogsError('Release not found', 404)

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

export interface ManualRelease {
  title: string
  artist: string
  year: number | null
  country: string | null
  label: string | null
  catno: string | null
  barcode: string | null
  format: string | null
  genres: string[]
  tracklist: Array<{ position: string; title: string; duration: string }>
  notes: string | null
  cover: Buffer | null
}

/** Stores a record that isn't on Discogs. It gets the next free negative ID so it can never collide with a Discogs ID. */
export function createManualRelease(r: ManualRelease): number {
  return db.transaction(() => {
    const min = (db.prepare('SELECT MIN(id) AS id FROM releases').get() as { id: number | null }).id ?? 0
    const id = Math.min(min, 0) - 1
    if (r.cover) fs.writeFileSync(coverPath(id), r.cover)
    db.prepare(
      `INSERT INTO releases
         (id, title, artist, year, country, label, catno, barcode, format, genres, tracklist, notes, has_cover)
       VALUES (@id, @title, @artist, @year, @country, @label, @catno, @barcode, @format, @genres, @tracklist, @notes, @hasCover)`,
    ).run({
      ...r,
      id,
      genres: JSON.stringify(r.genres),
      tracklist: JSON.stringify(r.tracklist),
      hasCover: r.cover ? 1 : 0,
    })
    return id
  })()
}
