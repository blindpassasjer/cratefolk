import { db } from './db.js'
import { DiscogsError, discogsRequest } from './discogs.js'
import { ensureRelease } from './releases.js'
import { decrypt } from './secrets.js'

// Cratefolk's database stays the source of truth. Changes made here are pushed to the user's Discogs
// account in the background (adds, grades, notes). "Sync" then merges both sides per record: each copy
// remembers what Discogs held at the last sync, so whichever side changed since wins, and Cratefolk
// wins when both did. Deletions only sync when the user opts in.

interface Account {
  username: string
  token: string
  push: boolean
  /** Also carry deletions over to the other side. */
  deletes: boolean
}

export function accountFor(userId: number): Account | null {
  const row = db
    .prepare('SELECT discogs_username AS username, discogs_token AS token, discogs_push AS push, discogs_sync_deletes AS deletes FROM users WHERE id = ?')
    .get(userId) as { username: string | null; token: string | null; push: number; deletes: number } | undefined
  if (!row?.username || !row.token) return null
  try {
    return { username: row.username, token: decrypt(row.token), push: !!row.push, deletes: !!row.deletes }
  } catch {
    return null // key changed or data damaged: treat as not connected
  }
}

// ---- grades ----

const GRADE_NAMES: Record<string, string> = {
  M: 'Mint (M)',
  NM: 'Near Mint (NM or M-)',
  'VG+': 'Very Good Plus (VG+)',
  VG: 'Very Good (VG)',
  'G+': 'Good Plus (G+)',
  G: 'Good (G)',
  F: 'Fair (F)',
  P: 'Poor (P)',
}

const gradeFromDiscogs = (value: string | undefined): string | null =>
  (value && /\((NM|M|VG\+|VG|G\+|G|F|P)(?: or M-)?\)/.exec(value)?.[1]) || null

// ---- Discogs calls ----

interface FieldIds {
  media?: number
  sleeve?: number
  notes?: number
}

const fieldCache = new Map<number, { at: number; ids: FieldIds }>()

/** Which of the user's custom collection fields hold grades and notes. */
async function fieldIds(userId: number, acct: Account): Promise<FieldIds> {
  const hit = fieldCache.get(userId)
  if (hit && Date.now() - hit.at < 3_600_000) return hit.ids
  const { fields } = await discogsRequest<{ fields: Array<{ id: number; name: string }> }>('GET', `/users/${acct.username}/collection/fields`, {
    token: acct.token,
    priority: 0,
  })
  const find = (name: string) => fields.find((f) => f.name.toLowerCase() === name)?.id
  const ids = { media: find('media condition'), sleeve: find('sleeve condition'), notes: find('notes') }
  fieldCache.set(userId, { at: Date.now(), ids })
  return ids
}

interface CopyValues {
  mediaCondition?: string | null
  sleeveCondition?: string | null
  notes?: string | null
}

async function setFields(userId: number, acct: Account, at: { folderId: number; releaseId: number; instanceId: number }, v: CopyValues) {
  const ids = await fieldIds(userId, acct)
  const base = `/users/${acct.username}/collection/folders/${at.folderId}/releases/${at.releaseId}/instances/${at.instanceId}/fields`
  const set = (field: number | undefined, value: string | null | undefined) =>
    field && value !== undefined ? discogsRequest('POST', `${base}/${field}`, { token: acct.token, priority: 0, body: { value: value ?? '' } }) : null
  // Discogs has no "ungraded" value to send, so a cleared grade is left as it was.
  const grade = (g: string | null | undefined) => (g ? GRADE_NAMES[g] : undefined)
  for (const job of [set(ids.media, grade(v.mediaCondition)), set(ids.sleeve, grade(v.sleeveCondition)), set(ids.notes, v.notes)]) await job
}

/** Remembers what Discogs now holds for a copy's grades and notes, so the next sync can tell which side changed. */
function saveSnapshot(copyId: number, v: { media?: string | null; sleeve?: string | null; notes?: string | null }): void {
  const sets = ['synced_at = @at']
  if (v.media !== undefined) sets.push('sync_media = @media')
  if (v.sleeve !== undefined) sets.push('sync_sleeve = @sleeve')
  if (v.notes !== undefined) sets.push('sync_notes = @notes')
  db.prepare(`UPDATE copies SET ${sets.join(', ')} WHERE id = @id`).run({ id: copyId, at: Date.now(), media: v.media ?? null, sleeve: v.sleeve ?? null, notes: v.notes ?? null })
}

const norm = (v: string | null | undefined) => v?.trim() || null

async function addToCollection(userId: number, acct: Account, copyId: number): Promise<void> {
  const copy = db
    .prepare('SELECT release_id AS releaseId, media_condition AS mediaCondition, sleeve_condition AS sleeveCondition, notes, discogs_instance_id AS instanceId FROM copies WHERE id = ?')
    .get(copyId) as (CopyValues & { releaseId: number; instanceId: number | null }) | undefined
  if (!copy || copy.instanceId || copy.releaseId <= 0) return
  const folderId = 1 // "Uncategorized", which every account has
  const res = await discogsRequest<{ instance_id: number }>('POST', `/users/${acct.username}/collection/folders/${folderId}/releases/${copy.releaseId}`, {
    token: acct.token,
    priority: 0,
  })
  db.prepare('UPDATE copies SET discogs_instance_id = ?, discogs_folder_id = ? WHERE id = ?').run(res.instance_id, folderId, copyId)
  await setFields(userId, acct, { folderId, releaseId: copy.releaseId, instanceId: res.instance_id }, copy)
  saveSnapshot(copyId, { media: copy.mediaCondition ?? null, sleeve: copy.sleeveCondition ?? null, notes: norm(copy.notes) })
}

const addWant = async (userId: number, acct: Account, releaseId: number, notes?: string | null) => {
  await discogsRequest('PUT', `/users/${acct.username}/wants/${releaseId}`, { token: acct.token, priority: 0, ...(notes ? { body: { notes } } : {}) })
  db.prepare('UPDATE wishlist SET discogs_synced = 1 WHERE user_id = ? AND release_id = ?').run(userId, releaseId)
}

// ---- remembering removals made here ----
// A record removed here would otherwise come straight back at the next sync, because it is still on Discogs.
// The removal is remembered so the sync neither re-imports it nor leaves it behind (if deletions are on, it is removed there too).

export function rememberCopyRemoval(copyId: number, userId: number): void {
  const copy = db
    .prepare('SELECT release_id AS releaseId, discogs_instance_id AS instanceId, discogs_folder_id AS folderId FROM copies WHERE id = ? AND user_id = ?')
    .get(copyId, userId) as { releaseId: number; instanceId: number | null; folderId: number | null } | undefined
  if (!copy?.instanceId) return
  db.prepare("INSERT OR IGNORE INTO discogs_removals (user_id, kind, release_id, instance_id, folder_id) VALUES (?, 'copy', ?, ?, ?)").run(userId, copy.releaseId, copy.instanceId, copy.folderId)
}

/** Call before a wishlist item is deleted. */
export function rememberWishRemoval(userId: number, releaseId: number): void {
  if (!db.prepare('SELECT 1 FROM wishlist WHERE user_id = ? AND release_id = ? AND discogs_synced = 1').get(userId, releaseId)) return
  db.prepare("INSERT OR IGNORE INTO discogs_removals (user_id, kind, release_id) VALUES (?, 'want', ?)").run(userId, releaseId)
}

/** Wishlisting a record again cancels an earlier remembered removal of it. */
export const forgetWishRemoval = (userId: number, releaseId: number) =>
  db.prepare("DELETE FROM discogs_removals WHERE user_id = ? AND kind = 'want' AND release_id = ?").run(userId, releaseId)

/** Disconnecting ends every link to that Discogs account. */
export function forgetLinks(userId: number): void {
  db.transaction(() => {
    db.prepare('UPDATE copies SET discogs_instance_id = NULL, discogs_folder_id = NULL, sync_media = NULL, sync_sleeve = NULL, sync_notes = NULL, synced_at = NULL WHERE user_id = ?').run(userId)
    db.prepare('UPDATE wishlist SET discogs_synced = 0 WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM discogs_removals WHERE user_id = ?').run(userId)
  })()
}

// ---- background pushes, called after a change has been saved locally ----

function inBackground(userId: number, what: string, job: (acct: Account) => Promise<unknown>): void {
  const acct = accountFor(userId)
  if (!acct?.push) return
  // A failed push never blocks or undoes the local change; a later Sync sends whatever is missing.
  job(acct).catch((e: Error) => console.warn(`Discogs: could not ${what} for user ${userId}: ${e.message}`))
}

export const pushNewCopy = (userId: number, copyId: number) => inBackground(userId, 'add a copy', (acct) => addToCollection(userId, acct, copyId))

export const pushWishlisted = (userId: number, releaseId: number, notes?: string | null) =>
  releaseId > 0 && inBackground(userId, 'add to the wantlist', (acct) => addWant(userId, acct, releaseId, notes))

/** Called when a wishlisted record is acquired: it leaves the wantlist on Discogs too. */
export const pushUnwishlisted = (userId: number, releaseId: number) =>
  releaseId > 0 &&
  inBackground(userId, 'remove from the wantlist', async (acct) => {
    try {
      await discogsRequest('DELETE', `/users/${acct.username}/wants/${releaseId}`, { token: acct.token, priority: 0 })
    } catch (e) {
      if ((e as DiscogsError).status !== 404) throw e // not on the wantlist there is fine
    }
    db.prepare("DELETE FROM discogs_removals WHERE user_id = ? AND kind = 'want' AND release_id = ?").run(userId, releaseId)
  })

/** Sends changed grades or notes of a copy that is linked to Discogs. Only the owner's account is touched. */
export function pushCopyEdit(copyId: number, changed: CopyValues): void {
  const copy = db
    .prepare('SELECT user_id AS userId, release_id AS releaseId, discogs_instance_id AS instanceId, discogs_folder_id AS folderId FROM copies WHERE id = ?')
    .get(copyId) as { userId: number; releaseId: number; instanceId: number | null; folderId: number | null } | undefined
  if (!copy?.instanceId || !copy.folderId) return
  inBackground(copy.userId, 'update a copy', async (acct) => {
    await setFields(copy.userId, acct, { folderId: copy.folderId!, releaseId: copy.releaseId, instanceId: copy.instanceId! }, changed)
    // A cleared grade can't be cleared on Discogs, so its snapshot is left alone.
    saveSnapshot(copyId, {
      media: changed.mediaCondition ? changed.mediaCondition : undefined,
      sleeve: changed.sleeveCondition ? changed.sleeveCondition : undefined,
      notes: changed.notes !== undefined ? norm(changed.notes) : undefined,
    })
  })
}

// ---- full sync ----

export interface SyncStatus {
  running: boolean
  phase: string
  done: number
  total: number
  /** Copies and wishlist items created here from Discogs, copies matched to ones already here, and items sent to Discogs. */
  imported: number
  linked: number
  pushed: number
  /** Copies whose grades or notes were brought in line, and records removed (here or on Discogs) to match the other side. */
  updated: number
  removed: number
  /** Records Discogs no longer has (or that failed to load). */
  skipped: number
  error?: string
  finishedAt?: number
}

const jobs = new Map<number, SyncStatus>()
export const syncStatus = (userId: number): SyncStatus | null => jobs.get(userId) ?? null

export function startSync(userId: number): boolean {
  const acct = accountFor(userId)
  if (!acct || jobs.get(userId)?.running) return false
  const status: SyncStatus = { running: true, phase: 'Starting', done: 0, total: 0, imported: 0, linked: 0, pushed: 0, updated: 0, removed: 0, skipped: 0 }
  jobs.set(userId, status)
  runSync(userId, acct, status)
    .catch((e: Error) => {
      status.error = e.message || 'Sync failed'
    })
    .finally(() => {
      status.running = false
      status.finishedAt = Date.now()
    })
  return true
}

type Page = { pagination: { pages: number; items: number } } & Record<string, unknown>

async function readAll<T>(acct: Account, path: string, key: string, status: SyncStatus): Promise<T[]> {
  const out: T[] = []
  for (let page = 1; ; page++) {
    const res = await discogsRequest<Page>('GET', path, { token: acct.token, priority: 0, params: { page: String(page), per_page: '100' } })
    out.push(...((res[key] as T[] | undefined) ?? []))
    status.total = res.pagination.items
    status.done = out.length
    if (page >= res.pagination.pages) return out
  }
}

interface CollectionItem {
  id: number
  instance_id: number
  folder_id: number
  date_added?: string
  notes?: Array<{ field_id: number; value: string }>
}

interface WantItem {
  id: number
  notes?: string
}

interface LocalCopy {
  id: number
  releaseId: number
  media: string | null
  sleeve: string | null
  notes: string | null
  syncMedia: string | null
  syncSleeve: string | null
  syncNotes: string | null
  syncedAt: number | null
  instanceId: number
  folderId: number
}

const COPY_COLUMNS = `id, release_id AS releaseId, media_condition AS media, sleeve_condition AS sleeve, notes,
  sync_media AS syncMedia, sync_sleeve AS syncSleeve, sync_notes AS syncNotes, synced_at AS syncedAt,
  discogs_instance_id AS instanceId, discogs_folder_id AS folderId`

const sqliteTime = (iso: string | undefined) => (iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toISOString().slice(0, 19).replace('T', ' ') : null)

type Action = 'keep' | 'pull' | 'push'

/**
 * Decides which side wins for one field. `s` is what Discogs held at the last sync (undefined if there was none):
 * a side that changed since then wins, and Cratefolk wins if both did. Without a snapshot Cratefolk wins unless it is blank.
 * A grade can't be cleared on Discogs, so a blank grade here never overwrites one there.
 */
function decide(l: string | null, r: string | null, s: string | null | undefined, isGrade: boolean): Action {
  if (l === r) return 'keep'
  if (isGrade && l === null) return s === undefined || r !== s ? 'pull' : 'keep'
  if (s === undefined) return l !== null ? 'push' : 'pull'
  if (l !== s) return 'push'
  return r !== s ? 'pull' : 'keep'
}

const FIELDS = ['media', 'sleeve', 'notes'] as const
type Field = (typeof FIELDS)[number]

async function runSync(userId: number, acct: Account, status: SyncStatus): Promise<void> {
  const ids = await fieldIds(userId, acct)
  const fieldId: Record<Field, number | undefined> = { media: ids.media, sleeve: ids.sleeve, notes: ids.notes }

  status.phase = 'Reading your Discogs collection'
  const items = await readAll<CollectionItem>(acct, `/users/${acct.username}/collection/folders/0/releases`, 'releases', status)
  status.phase = 'Reading your Discogs wantlist'
  const wants = await readAll<WantItem>(acct, `/users/${acct.username}/wants`, 'wants', status)
  const remoteInstances = new Set(items.map((i) => i.instance_id))
  const wantIds = new Set(wants.map((w) => w.id))

  // What has been removed on Discogs since the last sync: linked records that are no longer there.
  const linked = db.prepare(`SELECT ${COPY_COLUMNS} FROM copies WHERE user_id = ? AND discogs_instance_id IS NOT NULL`).all(userId) as LocalCopy[]
  const goneCopies = linked.filter((c) => !remoteInstances.has(c.instanceId))
  const syncedWishes = db.prepare('SELECT id, release_id AS releaseId FROM wishlist WHERE user_id = ? AND discogs_synced = 1').all(userId) as Array<{ id: number; releaseId: number }>
  const goneWishes = syncedWishes.filter((w) => !wantIds.has(w.releaseId))
  if (acct.deletes) {
    // An empty or short answer from Discogs (an error, the wrong account) must never wipe local records.
    const tooMany = (gone: number, total: number) => gone > 5 && gone > total * 0.3
    if (tooMany(goneCopies.length, linked.length) || tooMany(goneWishes.length, syncedWishes.length)) {
      throw new Error(
        `Discogs is missing ${goneCopies.length} of your ${linked.length} linked records and ${goneWishes.length} of ${syncedWishes.length} wishlist items. Nothing was changed. Check that the right Discogs account is connected, or turn off "Also sync deletions".`,
      )
    }
  }

  // Removals made here. They are carried out on Discogs only with deletions on; either way the record is not re-imported.
  const removals = db.prepare('SELECT id, kind, release_id AS releaseId, instance_id AS instanceId, folder_id AS folderId FROM discogs_removals WHERE user_id = ?').all(userId) as Array<{
    id: number
    kind: 'copy' | 'want'
    releaseId: number
    instanceId: number
    folderId: number | null
  }>
  const removedInstances = new Set(removals.filter((r) => r.kind === 'copy').map((r) => r.instanceId))
  const removedWants = new Set(removals.filter((r) => r.kind === 'want').map((r) => r.releaseId))
  if (acct.deletes) {
    status.phase = 'Removing deleted records from Discogs'
    status.done = 0
    status.total = removals.length
    for (const r of removals) {
      status.done++
      try {
        if (r.kind === 'copy' && remoteInstances.has(r.instanceId)) {
          await discogsRequest('DELETE', `/users/${acct.username}/collection/folders/${r.folderId ?? 1}/releases/${r.releaseId}/instances/${r.instanceId}`, { token: acct.token, priority: 0 })
          status.removed++
        } else if (r.kind === 'want' && wantIds.has(r.releaseId) && !db.prepare('SELECT 1 FROM wishlist WHERE user_id = ? AND release_id = ?').get(userId, r.releaseId)) {
          await discogsRequest('DELETE', `/users/${acct.username}/wants/${r.releaseId}`, { token: acct.token, priority: 0 })
          status.removed++
        }
        db.prepare('DELETE FROM discogs_removals WHERE id = ?').run(r.id)
      } catch {
        status.skipped++ // kept, and tried again next time
      }
    }
  }

  status.phase = 'Comparing your collections'
  status.done = 0
  status.total = items.length
  const localByInstance = new Map(linked.map((c) => [c.instanceId, c]))
  for (const it of items) {
    status.done++
    if (removedInstances.has(it.instance_id)) continue
    const value = (field: number | undefined) => it.notes?.find((n) => n.field_id === field)?.value
    const remote: Record<Field, string | null> = {
      media: gradeFromDiscogs(value(ids.media)),
      sleeve: gradeFromDiscogs(value(ids.sleeve)),
      notes: norm(value(ids.notes)),
    }

    let local = localByInstance.get(it.instance_id)
    if (!local) {
      try {
        await ensureRelease(it.id, userId)
      } catch {
        status.skipped++
        continue
      }
      // A copy added here before connecting is matched to its Discogs instance instead of being duplicated.
      const unlinked = db.prepare('SELECT id FROM copies WHERE user_id = ? AND release_id = ? AND discogs_instance_id IS NULL ORDER BY id LIMIT 1').get(userId, it.id) as { id: number } | undefined
      if (unlinked) {
        db.prepare('UPDATE copies SET discogs_instance_id = ?, discogs_folder_id = ? WHERE id = ?').run(it.instance_id, it.folder_id, unlinked.id)
        local = db.prepare(`SELECT ${COPY_COLUMNS} FROM copies WHERE id = ?`).get(unlinked.id) as LocalCopy
        status.linked++
      } else {
        db.prepare(
          `INSERT INTO copies (user_id, release_id, media_condition, sleeve_condition, notes, discogs_instance_id, discogs_folder_id, added_at,
                               sync_media, sync_sleeve, sync_notes, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), ?, ?, ?, ?)`,
        ).run(userId, it.id, remote.media, remote.sleeve, remote.notes, it.instance_id, it.folder_id, sqliteTime(it.date_added), remote.media, remote.sleeve, remote.notes, Date.now())
        status.imported++
        continue
      }
    }

    // Both sides have the copy: bring grades and notes in line.
    const l: Record<Field, string | null> = { media: local.media, sleeve: local.sleeve, notes: norm(local.notes) }
    const s: Record<Field, string | null | undefined> =
      local.syncedAt === null ? { media: undefined, sleeve: undefined, notes: undefined } : { media: local.syncMedia, sleeve: local.syncSleeve, notes: local.syncNotes }
    const pull: Partial<Record<Field, string | null>> = {}
    const push: Partial<Record<Field, string | null>> = {}
    const snap: Record<Field, string | null> = { media: remote.media, sleeve: remote.sleeve, notes: remote.notes }
    for (const f of FIELDS) {
      const action = decide(l[f], remote[f], s[f], f !== 'notes')
      if (action === 'pull') {
        pull[f] = remote[f]
        snap[f] = remote[f]
      } else if (action === 'push' && acct.push && fieldId[f]) {
        push[f] = l[f]
        snap[f] = l[f]
      } else if (action === 'keep') snap[f] = l[f]
    }
    if (Object.keys(pull).length) {
      const col = { media: 'media_condition', sleeve: 'sleeve_condition', notes: 'notes' } as const
      for (const f of Object.keys(pull) as Field[]) db.prepare(`UPDATE copies SET ${col[f]} = ? WHERE id = ?`).run(pull[f] ?? null, local.id)
    }
    if (Object.keys(push).length) {
      try {
        await setFields(userId, acct, { folderId: local.folderId, releaseId: local.releaseId, instanceId: local.instanceId }, {
          mediaCondition: push.media,
          sleeveCondition: push.sleeve,
          notes: push.notes,
        })
      } catch {
        status.skipped++
        continue // snapshot untouched, so the next sync tries again
      }
    }
    if (Object.keys(pull).length || Object.keys(push).length) status.updated++
    saveSnapshot(local.id, snap)
  }

  // Records that were on Discogs at the last sync and are gone now were removed there.
  if (acct.deletes) {
    for (const c of goneCopies) {
      db.prepare('DELETE FROM copies WHERE id = ? AND user_id = ?').run(c.id, userId)
      status.removed++
    }
  }

  status.phase = 'Comparing your wishlists'
  status.done = 0
  status.total = wants.length
  for (const w of wants) {
    status.done++
    if (removedWants.has(w.id)) continue
    if (db.prepare('UPDATE wishlist SET discogs_synced = 1 WHERE user_id = ? AND release_id = ?').run(userId, w.id).changes) continue
    if (db.prepare('SELECT 1 FROM copies WHERE user_id = ? AND release_id = ?').get(userId, w.id)) continue // already owned here
    try {
      await ensureRelease(w.id, userId)
    } catch {
      status.skipped++
      continue
    }
    const info = db.prepare('INSERT OR IGNORE INTO wishlist (user_id, release_id, notes, discogs_synced) VALUES (?, ?, ?, 1)').run(userId, w.id, w.notes?.trim() || null)
    status.imported += info.changes
  }
  if (acct.deletes) {
    for (const w of goneWishes) {
      db.prepare('DELETE FROM wishlist WHERE id = ? AND user_id = ?').run(w.id, userId)
      status.removed++
    }
  }

  if (!acct.push) return
  status.phase = 'Sending records to Discogs'
  const copies = db.prepare('SELECT id FROM copies WHERE user_id = ? AND discogs_instance_id IS NULL AND release_id > 0 ORDER BY id').all(userId) as Array<{ id: number }>
  // Wishlist items that were never on Discogs (items removed there stay removed: they are marked as synced).
  const wishes = db.prepare('SELECT release_id AS releaseId, notes FROM wishlist WHERE user_id = ? AND discogs_synced = 0 AND release_id > 0').all(userId) as Array<{ releaseId: number; notes: string | null }>
  status.done = 0
  status.total = copies.length + wishes.length
  // One record Discogs refuses must not stop the rest; it is counted as skipped.
  const send = async (job: () => Promise<unknown>) => {
    try {
      await job()
      status.pushed++
    } catch {
      status.skipped++
    }
    status.done++
  }
  for (const c of copies) await send(() => addToCollection(userId, acct, c.id))
  for (const w of wishes) await send(() => addWant(userId, acct, w.releaseId, w.notes))
}
