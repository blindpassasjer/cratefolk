import { getConnInfo } from '@hono/node-server/conninfo'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import {
  createSession,
  destroyOtherSessions,
  destroySession,
  hashPassword,
  requireUser,
  sha256,
  verifyPassword,
  type AppEnv,
} from '../auth.js'
import { config } from '../config.js'
import { db } from '../db.js'
import { CURRENCIES, DiscogsError, verifyToken } from '../discogs.js'
import { accountFor, startSync, syncStatus } from '../discogsSync.js'
import { encrypt } from '../secrets.js'

export const authRoutes = new Hono<AppEnv>()

// Naive in-memory throttle over 15 minutes: 10 failed attempts per email+IP, and 40 per IP across all emails.
// The IP is the socket address; X-Forwarded-For is only used with TRUST_PROXY=true, as clients can fake it.
const failures = new Map<string, { count: number; resetAt: number }>()
const WINDOW_MS = 15 * 60_000
const MAX_FAILURES = 10
const MAX_FAILURES_PER_IP = 40

const clientIp = (c: Context) =>
  (config.trustProxy ? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() : undefined) ||
  getConnInfo(c).remote.address ||
  'unknown'

const blocked = (key: string, max: number) => {
  const e = failures.get(key)
  return !!e && e.resetAt > Date.now() && e.count >= max
}

function recordFailure(...keys: string[]) {
  const now = Date.now()
  if (failures.size > 5000) for (const [k, e] of failures) if (e.resetAt <= now) failures.delete(k)
  for (const key of keys) {
    const e = failures.get(key)
    if (e && e.resetAt > now) e.count++
    else failures.set(key, { count: 1, resetAt: now + WINDOW_MS })
  }
}

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) })

authRoutes.post('/login', async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Email and password required' }, 400)
  const email = parsed.data.email.toLowerCase()

  const ip = clientIp(c)
  const key = `${email}|${ip}`
  const ipKey = `ip|${ip}`
  if (blocked(key, MAX_FAILURES) || blocked(ipKey, MAX_FAILURES_PER_IP)) {
    return c.json({ error: 'Too many attempts, try again later' }, 429)
  }

  const user = db
    .prepare('SELECT id, password_hash, disabled FROM users WHERE email = ?')
    .get(email) as { id: number; password_hash: string; disabled: number } | undefined
  const ok = user && !user.disabled && (await verifyPassword(parsed.data.password, user.password_hash))
  if (!ok) {
    recordFailure(key, ipKey)
    return c.json({ error: 'Invalid email or password' }, 401)
  }

  failures.delete(key)
  createSession(c, user.id)
  return c.json({ ok: true })
})

export const registrationOpen = () =>
  (db.prepare("SELECT value FROM settings WHERE key = 'registration_open'").get() as { value: string } | undefined)?.value === '1'

authRoutes.get('/registration-status', (c) => c.json({ open: registrationOpen() }))

const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email(),
  password: z.string().min(8).max(200),
})

authRoutes.post('/register', async (c) => {
  if (!registrationOpen()) return c.json({ error: 'Registration is closed' }, 403)
  const parsed = registerSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Valid name, email and a password of 8+ characters required' }, 400)
  const { name, password } = parsed.data
  const email = parsed.data.email.toLowerCase()

  const ipKey = `register|${clientIp(c)}`
  if (blocked(ipKey, MAX_FAILURES)) return c.json({ error: 'Too many attempts, try again later' }, 429)
  recordFailure(ipKey) // counts every attempt, so one address can't mass-create accounts

  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    return c.json({ error: 'An account with that email already exists' }, 409)
  }
  const info = db
    .prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'user')")
    .run(email, name, await hashPassword(password))
  createSession(c, Number(info.lastInsertRowid))
  return c.json({ ok: true }, 201)
})

authRoutes.post('/logout', (c) => {
  destroySession(c)
  return c.json({ ok: true })
})

authRoutes.get('/me', requireUser, (c) => c.json({ user: c.get('user') }))

const profileSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().email().optional(),
  currency: z.enum(CURRENCIES).optional(),
  shareCollection: z.boolean().optional(),
  shareWishlist: z.boolean().optional(),
  shareActivity: z.boolean().optional(),
  shops: z.array(z.string().regex(/^[a-z0-9-]{1,30}$/)).max(60).optional(),
  currentPassword: z.string().optional(),
})

const passwordMatches = async (userId: number, password: string | undefined) => {
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string }
  return !!password && (await verifyPassword(password, row.password_hash))
}

// The admin account's email and password come from the environment, so only name and currency can change.
authRoutes.patch('/me', requireUser, async (c) => {
  const parsed = profileSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Check the details you entered' }, 400)
  const user = c.get('user')
  const { name, email, currency, currentPassword, shareCollection, shareWishlist, shareActivity, shops } = parsed.data

  if (email !== undefined && email.toLowerCase() !== user.email) {
    if (user.email === config.adminEmail) {
      return c.json({ error: 'The admin email is set through the ADMIN_EMAIL environment variable' }, 400)
    }
    if (!(await passwordMatches(user.id, currentPassword))) {
      return c.json({ error: 'Enter your current password to change your email' }, 403)
    }
    if (db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').get(email, user.id)) {
      return c.json({ error: 'That email is already in use' }, 409)
    }
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email.toLowerCase(), user.id)
  }
  if (name !== undefined) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, user.id)
  if (currency !== undefined) db.prepare('UPDATE users SET currency = ? WHERE id = ?').run(currency, user.id)
  if (shareCollection !== undefined) db.prepare('UPDATE users SET share_collection = ? WHERE id = ?').run(shareCollection ? 1 : 0, user.id)
  if (shareWishlist !== undefined) db.prepare('UPDATE users SET share_wishlist = ? WHERE id = ?').run(shareWishlist ? 1 : 0, user.id)
  if (shareActivity !== undefined) db.prepare('UPDATE users SET share_activity = ? WHERE id = ?').run(shareActivity ? 1 : 0, user.id)

  if (shops !== undefined) db.prepare('UPDATE users SET shops = ? WHERE id = ?').run([...new Set(shops)].join(','), user.id)

  return c.json({ user: db.prepare('SELECT id, email, name, role, currency, share_collection AS shareCollection, share_wishlist AS shareWishlist, share_activity AS shareActivity, shops, discogs_username AS discogsUsername FROM users WHERE id = ?').get(user.id) })
})

// Each user connects their own Discogs account with a personal access token (Discogs settings → Developers).
// It is checked against Discogs first, then stored encrypted and never sent back to the browser.
authRoutes.put('/discogs', requireUser, async (c) => {
  const parsed = z.object({ token: z.string().trim().min(10).max(200) }).safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Paste your Discogs personal access token' }, 400)
  try {
    const username = await verifyToken(parsed.data.token)
    db.prepare('UPDATE users SET discogs_username = ?, discogs_token = ? WHERE id = ?').run(username, encrypt(parsed.data.token), c.get('user').id)
    return c.json({ discogsUsername: username })
  } catch (e) {
    if (e instanceof DiscogsError && e.status === 401) return c.json({ error: 'Discogs did not accept that token' }, 400)
    return c.json({ error: e instanceof DiscogsError ? e.message : 'Could not check the token with Discogs' }, 502)
  }
})

authRoutes.get('/discogs', requireUser, (c) => {
  const acct = accountFor(c.get('user').id)
  return c.json({ connected: !!acct, push: acct?.push ?? true, sync: syncStatus(c.get('user').id) })
})

authRoutes.patch('/discogs', requireUser, async (c) => {
  const parsed = z.object({ push: z.boolean() }).safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400)
  db.prepare('UPDATE users SET discogs_push = ? WHERE id = ?').run(parsed.data.push ? 1 : 0, c.get('user').id)
  return c.json({ push: parsed.data.push })
})

// Pulls in what is on Discogs but not here, then (if enabled) sends what is here but not there. Runs in the background.
authRoutes.post('/discogs/sync', requireUser, (c) => {
  const userId = c.get('user').id
  if (!accountFor(userId)) return c.json({ error: 'Connect your Discogs account first' }, 400)
  if (!startSync(userId)) return c.json({ error: 'A sync is already running' }, 409)
  return c.json({ sync: syncStatus(userId) }, 202)
})

authRoutes.delete('/discogs', requireUser, (c) => {
  const userId = c.get('user').id
  db.transaction(() => {
    db.prepare('UPDATE users SET discogs_username = NULL, discogs_token = NULL WHERE id = ?').run(userId)
    db.prepare('UPDATE copies SET discogs_instance_id = NULL, discogs_folder_id = NULL WHERE user_id = ?').run(userId) // links belong to that account
  })()
  return c.json({ ok: true })
})

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
})

authRoutes.post('/password', requireUser, async (c) => {
  const parsed = passwordSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'The new password must be at least 8 characters' }, 400)
  const user = c.get('user')
  if (user.email === config.adminEmail) {
    return c.json({ error: 'The admin password is set through the ADMIN_PASSWORD environment variable' }, 400)
  }
  if (!(await passwordMatches(user.id, parsed.data.currentPassword))) {
    return c.json({ error: 'Your current password is incorrect' }, 403)
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(parsed.data.newPassword), user.id)
  destroyOtherSessions(c, user.id)
  return c.json({ ok: true })
})

// ---- Resetting a forgotten password with a link from the admin (public) ----

const resetLookup = (token: string) =>
  db
    .prepare(
      `SELECT u.id, u.name, u.email FROM password_resets p JOIN users u ON u.id = p.user_id
       WHERE p.token_hash = ? AND p.expires_at > ? AND u.disabled = 0`,
    )
    .get(sha256(token), Date.now()) as { id: number; name: string; email: string } | undefined

const RESET_INVALID = 'This reset link is invalid or has expired. Ask your admin for a new one.'

authRoutes.get('/reset/:token', (c) => {
  const user = resetLookup(c.req.param('token'))
  return user ? c.json({ name: user.name, email: user.email }) : c.json({ error: RESET_INVALID }, 404)
})

authRoutes.post('/reset', async (c) => {
  const parsed = z.object({ token: z.string().min(1), password: z.string().min(8).max(200) }).safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'The new password must be at least 8 characters' }, 400)
  const user = resetLookup(parsed.data.token)
  if (!user) return c.json({ error: RESET_INVALID }, 404)
  const hash = await hashPassword(parsed.data.password)
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id)
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id)
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id)
  })()
  return c.json({ ok: true })
})
