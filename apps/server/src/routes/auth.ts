import { Hono } from 'hono'
import { z } from 'zod'
import {
  createSession,
  destroySession,
  requireUser,
  verifyPassword,
  type AppEnv,
} from '../auth.js'
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

authRoutes.patch('/me', requireUser, async (c) => {
  const parsed = z.object({ currency: z.enum(CURRENCIES) }).safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Unsupported currency' }, 400)
  db.prepare('UPDATE users SET currency = ? WHERE id = ?').run(parsed.data.currency, c.get('user').id)
  return c.json({ ok: true })
})
