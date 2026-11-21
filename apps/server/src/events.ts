import { db } from './db.js'

export type EventType = 'added' | 'wishlisted' | 'listed' | 'sold'

const DEDUPE_MS = 10 * 60_000

/** Records something for the friends feed. Hand-added records are private, and repeats within minutes are dropped. */
export function logEvent(userId: number, type: EventType, releaseId: number): void {
  if (releaseId <= 0) return
  const now = Date.now()
  const recent = db
    .prepare('SELECT 1 FROM events WHERE user_id = ? AND type = ? AND release_id = ? AND created_at > ?')
    .get(userId, type, releaseId, now - DEDUPE_MS)
  if (!recent) db.prepare('INSERT INTO events (user_id, type, release_id, created_at) VALUES (?, ?, ?, ?)').run(userId, type, releaseId, now)
}

/** Old events are only useful for a while; the feed shows the last month. */
export function purgeOldEvents(): void {
  db.prepare('DELETE FROM events WHERE created_at < ?').run(Date.now() - 90 * 86_400_000)
}
