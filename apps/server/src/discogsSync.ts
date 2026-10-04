import { db } from './db.js'
import { discogsRequest } from './discogs.js'
import { ensureRelease } from './releases.js'
import { decrypt } from './secrets.js'

// Cratelog's database stays the source of truth. Changes made here are pushed to the user's Discogs
// account in the background (adds, grades, notes), and "Sync" pulls in what is on Discogs but not
// here, then pushes what is here but not there. Nothing is ever deleted on either side.

interface Account {
  username: string
  token: string
  push: boolean
}

export function accountFor(userId: number): Account | null {
  const row = db.prepare('SELECT discogs_username AS username, discogs_token AS token, discogs_push AS push FROM users WHERE id = ?').get(userId) as
    | { username: string | null; token: string | null; push: number }
    | undefined
  if (!row?.username || !row.token) return null
  try {
    return { username: row.username, token: decrypt(row.token), push: !!row.push }
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
}

const addWant = (acct: Account, releaseId: number, notes?: string | null) =>
  discogsRequest('PUT', `/users/${acct.username}/wants/${releaseId}`, { token: acct.token, priority: 0, ...(notes ? { body: { notes } } : {}) })

// ---- background pushes, called after a change has been saved locally ----

function inBackground(userId: number, what: string, job: (acct: Account) => Promise<unknown>): void {
  const acct = accountFor(userId)
  if (!acct?.push) return
  // A failed push never blocks or undoes the local change; a later Sync sends whatever is missing.
  job(acct).catch((e: Error) => console.warn(`Discogs: could not ${what} for user ${userId}: ${e.message}`))
}

export const pushNewCopy = (userId: number, copyId: number) => inBackground(userId, 'add a copy', (acct) => addToCollection(userId, acct, copyId))

export const pushWishlisted = (userId: number, releaseId: number, notes?: string | null) =>
  releaseId > 0 && inBackground(userId, 'add to the wantlist', (acct) => addWant(acct, releaseId, notes))

/** Called when a wishlisted record is acquired: it leaves the wantlist on Discogs too. */
export const pushUnwishlisted = (userId: number, releaseId: number) =>
  releaseId > 0 &&
  inBackground(userId, 'remove from the wantlist', (acct) =>
    discogsRequest('DELETE', `/users/${acct.username}/wants/${releaseId}`, { token: acct.token, priority: 0 }).catch((e: Error & { status?: number }) => {
      if (e.status !== 404) throw e // not on the wantlist there is fine
    }),
  )

/** Sends changed grades or notes of a copy that is linked to Discogs. Only the owner's account is touched. */
export function pushCopyEdit(copyId: number, changed: CopyValues): void {
  const copy = db
    .prepare('SELECT user_id AS userId, release_id AS releaseId, discogs_instance_id AS instanceId, discogs_folder_id AS folderId FROM copies WHERE id = ?')
    .get(copyId) as { userId: number; releaseId: number; instanceId: number | null; folderId: number | null } | undefined
  if (!copy?.instanceId || !copy.folderId) return
  inBackground(copy.userId, 'update a copy', (acct) => setFields(copy.userId, acct, { folderId: copy.folderId!, releaseId: copy.releaseId, instanceId: copy.instanceId! }, changed))
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
  const status: SyncStatus = { running: true, phase: 'Starting', done: 0, total: 0, imported: 0, linked: 0, pushed: 0, skipped: 0 }
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

const sqliteTime = (iso: string | undefined) => (iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toISOString().slice(0, 19).replace('T', ' ') : null)

async function runSync(userId: number, acct: Account, status: SyncStatus): Promise<void> {
  const ids = await fieldIds(userId, acct)

  status.phase = 'Reading your Discogs collection'
  const items = await readAll<CollectionItem>(acct, `/users/${acct.username}/collection/folders/0/releases`, 'releases', status)

  status.phase = 'Adding records from Discogs'
  status.done = 0
  status.total = items.length
  for (const it of items) {
    status.done++
    if (db.prepare('SELECT 1 FROM copies WHERE user_id = ? AND discogs_instance_id = ?').get(userId, it.instance_id)) continue
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
      status.linked++
      continue
    }
    const value = (field: number | undefined) => it.notes?.find((n) => n.field_id === field)?.value
    const addedAt = sqliteTime(it.date_added)
    db.prepare(
      `INSERT INTO copies (user_id, release_id, media_condition, sleeve_condition, notes, discogs_instance_id, discogs_folder_id, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`,
    ).run(userId, it.id, gradeFromDiscogs(value(ids.media)), gradeFromDiscogs(value(ids.sleeve)), value(ids.notes)?.trim() || null, it.instance_id, it.folder_id, addedAt)
    status.imported++
  }

  status.phase = 'Reading your Discogs wantlist'
  const wants = await readAll<WantItem>(acct, `/users/${acct.username}/wants`, 'wants', status)
  status.phase = 'Adding wishlist items from Discogs'
  status.done = 0
  status.total = wants.length
  for (const w of wants) {
    status.done++
    if (db.prepare('SELECT 1 FROM copies WHERE user_id = ? AND release_id = ?').get(userId, w.id)) continue // already owned here
    try {
      await ensureRelease(w.id, userId)
    } catch {
      status.skipped++
      continue
    }
    const info = db.prepare('INSERT OR IGNORE INTO wishlist (user_id, release_id, notes) VALUES (?, ?, ?)').run(userId, w.id, w.notes?.trim() || null)
    status.imported += info.changes
  }

  if (!acct.push) return
  status.phase = 'Sending records to Discogs'
  const copies = db.prepare('SELECT id FROM copies WHERE user_id = ? AND discogs_instance_id IS NULL AND release_id > 0 ORDER BY id').all(userId) as Array<{ id: number }>
  const wanted = new Set(wants.map((w) => w.id))
  const wishes = (db.prepare('SELECT release_id AS releaseId, notes FROM wishlist WHERE user_id = ? AND release_id > 0').all(userId) as Array<{ releaseId: number; notes: string | null }>).filter((w) => !wanted.has(w.releaseId))
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
  for (const w of wishes) await send(() => addWant(acct, w.releaseId, w.notes))
}
