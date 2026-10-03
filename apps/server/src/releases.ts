import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { db } from './db.js'
import { DiscogsError, downloadImage, fetchRelease } from './discogs.js'
import { prefetchTrivia } from './trivia.js'

const coversDir = path.join(config.dataDir, 'covers')
fs.mkdirSync(coversDir, { recursive: true })

export const coverPath = (id: number) => path.join(coversDir, `${id}.jpg`)

/** Discogs releases are shared by everyone; a record added by hand (negative ID) only by its creator. */
/** Whether this user created the record by hand. Only the creator can edit or delete it, or add copies of it. */
export function isCreator(id: number, userId: number): boolean {
  const row = db.prepare('SELECT owner_id AS ownerId FROM releases WHERE id = ?').get(id) as { ownerId: number | null } | undefined
  return !!row && row.ownerId === userId
}

/** Whether this user can view the release: any Discogs record, or a hand-added one they created or co-own a copy of. */
export function canAccessRelease(id: number, userId: number): boolean {
  if (id > 0) return true
  return isCreator(id, userId) || !!db.prepare('SELECT 1 FROM copies WHERE release_id = ? AND co_owner_id = ?').get(id, userId)
}

/** Returns once the release is in the local cache, fetching it from Discogs on first use. */
export async function ensureRelease(id: number, userId: number): Promise<void> {
  if (id < 0) {
    // Manually entered records have negative IDs, don't exist on Discogs, and are private to their creator.
    if (!isCreator(id, userId)) throw new DiscogsError('Release not found', 404)
    return
  }
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
  prefetchTrivia(id)
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
export function createManualRelease(r: ManualRelease, ownerId: number): number {
  const id = db.transaction(() => {
    const min = (db.prepare('SELECT MIN(id) AS id FROM releases').get() as { id: number | null }).id ?? 0
    const id = Math.min(min, 0) - 1
    if (r.cover) fs.writeFileSync(coverPath(id), r.cover)
    db.prepare(
      `INSERT INTO releases
         (id, title, artist, year, country, label, catno, barcode, format, genres, tracklist, notes, has_cover, owner_id)
       VALUES (@id, @title, @artist, @year, @country, @label, @catno, @barcode, @format, @genres, @tracklist, @notes, @hasCover, @ownerId)`,
    ).run({
      ...r,
      id,
      ownerId,
      genres: JSON.stringify(r.genres),
      tracklist: JSON.stringify(r.tracklist),
      hasCover: r.cover ? 1 : 0,
    })
    return id
  })()
  prefetchTrivia(id)
  return id
}

/** Replaces the fields of a manual record. `cover`: a Buffer replaces the image, null removes it, undefined keeps it. */
export function updateManualRelease(id: number, r: Omit<ManualRelease, 'cover'>, cover: Buffer | null | undefined): void {
  db.transaction(() => {
    if (cover) fs.writeFileSync(coverPath(id), cover)
    else if (cover === null) fs.rmSync(coverPath(id), { force: true })
    db.prepare(
      `UPDATE releases SET title = @title, artist = @artist, year = @year, country = @country, label = @label,
         catno = @catno, barcode = @barcode, format = @format, genres = @genres, tracklist = @tracklist, notes = @notes
       WHERE id = @id`,
    ).run({ ...r, id, genres: JSON.stringify(r.genres), tracklist: JSON.stringify(r.tracklist) })
    if (cover !== undefined) db.prepare('UPDATE releases SET has_cover = ? WHERE id = ?').run(cover ? 1 : 0, id)
    // The title or artist may have changed, so what was found for the old ones no longer applies.
    db.prepare('DELETE FROM trivia WHERE release_id = ?').run(id)
  })()
  prefetchTrivia(id)
}

/** Deletes a manual record together with its copies and wishlist entry (only its creator can have any). */
export function deleteManualRelease(id: number): void {
  db.transaction(() => {
    db.prepare('DELETE FROM copies WHERE release_id = ?').run(id)
    db.prepare('DELETE FROM wishlist WHERE release_id = ?').run(id)
    db.prepare('DELETE FROM releases WHERE id = ?').run(id)
  })()
  fs.rmSync(coverPath(id), { force: true })
}
