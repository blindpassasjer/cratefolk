import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { config } from './config.js'
import { db } from './db.js'
import { DiscogsError, downloadImage, fetchRelease } from './discogs.js'
import { prefetchTrivia } from './trivia.js'

const coversDir = path.join(config.dataDir, 'covers')
fs.mkdirSync(coversDir, { recursive: true })

/** SQL column of a release's track titles as one string, so list views can search them without shipping the whole tracklist. */
export const TRACKS_SQL = `(SELECT group_concat(json_extract(value, '$.title'), ' / ') FROM json_each(r.tracklist)) AS tracks`

export const coverPath = (id: number) => path.join(coversDir, `${id}.jpg`)
const thumbPath = (id: number) => path.join(coversDir, `${id}.thumb.jpg`)

// Grids show covers at 110-340px, so a 480px JPEG is sharp enough even on high-density screens.
const THUMB_SIZE = 480
const thumbJobs = new Map<number, Promise<string | null>>()

/**
 * The file to serve for a cover, or null if there is none. With `thumb`, a smaller copy that is made on first request
 * (so existing collections need no migration) and kept next to the original. Falls back to the original if resizing fails.
 */
export async function coverFile(id: number, thumb: boolean): Promise<string | null> {
  const full = coverPath(id)
  if (!Number.isInteger(id) || !fs.existsSync(full)) return null
  if (!thumb) return full
  const small = thumbPath(id)
  if (fs.existsSync(small)) return small
  let job = thumbJobs.get(id)
  if (!job) {
    const tmp = `${small}.${process.pid}.tmp`
    job = sharp(full)
      .rotate()
      .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toFile(tmp)
      .then(() => {
        fs.renameSync(tmp, small)
        return small
      })
      .catch(() => {
        fs.rmSync(tmp, { force: true })
        return null
      })
      .finally(() => thumbJobs.delete(id))
    thumbJobs.set(id, job)
  }
  return (await job) ?? full
}

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
    if (cover !== undefined) fs.rmSync(thumbPath(id), { force: true }) // made again from the new image when next needed
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
  fs.rmSync(thumbPath(id), { force: true })
}

/** Moves a manual record's copies and wishlist entry onto a real Discogs release, then deletes the manual record. */
export async function linkManualRelease(id: number, discogsId: number, userId: number): Promise<number[]> {
  await ensureRelease(discogsId, userId)
  const copyIds = db.transaction(() => {
    const ids = (db.prepare('SELECT id FROM copies WHERE release_id = ?').all(id) as Array<{ id: number }>).map((r) => r.id)
    db.prepare('UPDATE copies SET release_id = ? WHERE release_id = ?').run(discogsId, id)
    // They may already have the Discogs release wishlisted; then the manual entry is simply dropped.
    db.prepare('UPDATE OR IGNORE wishlist SET release_id = ? WHERE release_id = ?').run(discogsId, id)
    return ids
  })()
  deleteManualRelease(id)
  return copyIds
}
