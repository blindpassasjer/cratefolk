import { db, stmt, type Stmt } from './db.js'

export type EventType = 'added' | 'wishlisted' | 'listed' | 'sold'

const DEDUPE_MS = 10 * 60_000

/**
 * Records something for the friends feed. Hand-added records are private, and repeats within minutes are dropped.
 * Returns a statement (or null) so it can join a batch; `logEvent` runs it on its own.
 */
export function eventStmt(userId: number, type: EventType, releaseId: number): Stmt | null {
  if (releaseId <= 0) return null
  const now = Date.now()
  return stmt(
    `INSERT INTO events (user_id, type, release_id, created_at)
     SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM events WHERE user_id = ? AND type = ? AND release_id = ? AND created_at > ?)`,
    userId, type, releaseId, now, userId, type, releaseId, now - DEDUPE_MS,
  )
}

export async function logEvent(userId: number, type: EventType, releaseId: number): Promise<void> {
  const s = eventStmt(userId, type, releaseId)
  if (s) await db.run(s.sql, ...s.params)
}

/** Old events are only useful for a while; the feed shows the last month. */
export async function purgeOldEvents(): Promise<void> {
  await db.run('DELETE FROM events WHERE created_at < ?', Date.now() - 90 * 86_400_000)
}
