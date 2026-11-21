import { background } from './background.js'
import { covers } from './covers.js'
import { db, stmt } from './db.js'
import { DiscogsError, downloadImage, fetchRelease } from './discogs.js'
import { prefetchTrivia } from './trivia.js'

/** SQL column of a release's track titles as one string, so list views can search them without shipping the whole tracklist. */
export const TRACKS_SQL = `(SELECT group_concat(json_extract(value, '$.title'), ' / ') FROM json_each(r.tracklist)) AS tracks`

/** Discogs releases are shared by everyone; a record added by hand (negative ID) only by its creator. */
/** Whether this user created the record by hand. Only the creator can edit or delete it, or add copies of it. */
export async function isCreator(id: number, userId: number): Promise<boolean> {
  const row = await db.get('SELECT owner_id AS ownerId FROM releases WHERE id = ?', id) as { ownerId: number | null } | undefined
  return !!row && row.ownerId === userId
}

/** Whether this user can view the release: any Discogs record, or a hand-added one they created or co-own a copy of. */
export async function canAccessRelease(id: number, userId: number): Promise<boolean> {
  if (id > 0) return true
  return await isCreator(id, userId) || !!await db.get('SELECT 1 FROM copies WHERE release_id = ? AND co_owner_id = ?', id, userId)
}

/** Returns once the release is in the local cache, fetching it from Discogs on first use. */
export async function ensureRelease(id: number, userId: number): Promise<void> {
  if (id < 0) {
    // Manually entered records have negative IDs, don't exist on Discogs, and are private to their creator.
    if (!await isCreator(id, userId)) throw new DiscogsError('Release not found', 404)
    return
  }
  if (await db.get('SELECT 1 FROM releases WHERE id = ?', id)) return

  const r = await fetchRelease(id)
  const image = r.coverUrl ? await downloadImage(r.coverUrl) : null
  if (image) await covers.write(id, image)

  await db.run(
    `INSERT OR REPLACE INTO releases
       (id, master_id, title, artist, year, country, label, catno, barcode, format,
        genres, styles, tracklist, notes, has_cover)
     VALUES (@id, @masterId, @title, @artist, @year, @country, @label, @catno, @barcode, @format,
        @genres, @styles, @tracklist, @notes, @hasCover)`, {
    ...r,
    genres: JSON.stringify(r.genres),
    styles: JSON.stringify(r.styles),
    tracklist: JSON.stringify(r.tracklist),
    hasCover: image ? 1 : 0,
  })
  background(prefetchTrivia(id))
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
export async function createManualRelease(r: ManualRelease, ownerId: number): Promise<number> {
  // The ID is picked inside the INSERT itself, so two simultaneous requests can't be handed the same one.
  const [res] = await db.batch([
    stmt(
      `INSERT INTO releases
         (id, title, artist, year, country, label, catno, barcode, format, genres, tracklist, notes, has_cover, owner_id)
       VALUES ((SELECT MIN(COALESCE(MIN(id), 0), 0) - 1 FROM releases),
               @title, @artist, @year, @country, @label, @catno, @barcode, @format, @genres, @tracklist, @notes, @hasCover, @ownerId)`,
      {
        ...r,
        ownerId,
        genres: JSON.stringify(r.genres),
        tracklist: JSON.stringify(r.tracklist),
        hasCover: r.cover ? 1 : 0,
      },
    ),
  ])
  const id = res!.lastInsertRowid
  if (r.cover) {
    try {
      await covers.write(id, r.cover)
    } catch (err) {
      await db.run('DELETE FROM releases WHERE id = ?', id)
      throw err
    }
  }
  background(prefetchTrivia(id))
  return id
}

/** Replaces the fields of a manual record. `cover`: a Buffer replaces the image, null removes it, undefined keeps it. */
export async function updateManualRelease(id: number, r: Omit<ManualRelease, 'cover'>, cover: Buffer | null | undefined): Promise<void> {
  if (cover) await covers.write(id, cover)
  else if (cover === null) await covers.remove(id)
  await db.batch([
    stmt(
      `UPDATE releases SET title = @title, artist = @artist, year = @year, country = @country, label = @label,
         catno = @catno, barcode = @barcode, format = @format, genres = @genres, tracklist = @tracklist, notes = @notes
       WHERE id = @id`,
      { ...r, id, genres: JSON.stringify(r.genres), tracklist: JSON.stringify(r.tracklist) },
    ),
    ...(cover !== undefined ? [stmt('UPDATE releases SET has_cover = ? WHERE id = ?', cover ? 1 : 0, id)] : []),
    // The title or artist may have changed, so what was found for the old ones no longer applies.
    stmt('DELETE FROM trivia WHERE release_id = ?', id),
  ])
  background(prefetchTrivia(id))
}

/** Deletes a manual record together with its copies and wishlist entry (only its creator can have any). */
export async function deleteManualRelease(id: number): Promise<void> {
  await db.batch([
    stmt('DELETE FROM copies WHERE release_id = ?', id),
    stmt('DELETE FROM wishlist WHERE release_id = ?', id),
    stmt('DELETE FROM releases WHERE id = ?', id),
  ])
  await covers.remove(id)
}

/** Moves a manual record's copies and wishlist entry onto a real Discogs release, then deletes the manual record. */
export async function linkManualRelease(id: number, discogsId: number, userId: number): Promise<number[]> {
  await ensureRelease(discogsId, userId)
  const ids = (await db.all<{ id: number }>('SELECT id FROM copies WHERE release_id = ?', id)).map((r) => r.id)
  await db.batch([
    stmt('UPDATE copies SET release_id = ? WHERE release_id = ?', discogsId, id),
    // They may already have the Discogs release wishlisted; then the manual entry is simply dropped.
    stmt('UPDATE OR IGNORE wishlist SET release_id = ? WHERE release_id = ?', discogsId, id),
  ])
  await deleteManualRelease(id)
  return ids
}
