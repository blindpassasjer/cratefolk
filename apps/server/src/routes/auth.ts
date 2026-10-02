import { Hono } from 'hono'
import { z } from 'zod'
import {
  createSession,
  destroyOtherSessions,
  destroySession,
  hashPassword,
  requireUser,
  verifyPassword,
  type AppEnv,
} from '../auth.js'
import { config } from '../config.js'
import { db } from '../db.js'
import { CURRENCIES } from '../discogs.js'

export const authRoutes = new Hono<AppEnv>()

// Naive in-memory throttle: 10 failed attempts per email+IP per 15 minutes.
const failures = new Map<string, { count: number; resetAt: number }>()
const WINDOW_MS = 15 * 60_000
const MAX_FAILURES = 10

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) })

authRoutes.post('/login', async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Email and password required' }, 400)
  const email = parsed.data.email.toLowerCase()

  const key = `${email}|${c.req.header('x-forwarded-for') ?? 'direct'}`
  const entry = failures.get(key)
  if (entry && entry.resetAt > Date.now() && entry.count >= MAX_FAILURES) {
    return c.json({ error: 'Too many attempts, try again later' }, 429)
  }

  const user = db
    .prepare('SELECT id, password_hash, disabled FROM users WHERE email = ?')
    .get(email) as { id: number; password_hash: string; disabled: number } | undefined
  const ok = user && !user.disabled && (await verifyPassword(parsed.data.password, user.password_hash))
  if (!ok) {
    const fresh = entry && entry.resetAt > Date.now() ? entry : { count: 0, resetAt: Date.now() + WINDOW_MS }
    fresh.count++
    failures.set(key, fresh)
    return c.json({ error: 'Invalid email or password' }, 401)
  }

  failures.delete(key)
  createSession(c, user.id)
  return c.json({ ok: true })
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
  const { name, email, currency, currentPassword } = parsed.data

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

  return c.json({ user: db.prepare('SELECT id, email, name, role, currency FROM users WHERE id = ?').get(user.id) })
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
