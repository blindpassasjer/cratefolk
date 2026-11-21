import { Hono } from 'hono'
import { z } from 'zod'
import crypto from 'node:crypto'
import { hashPassword, requireAdmin, requireUser, sha256, type AppEnv } from '../auth.js'
import { config } from '../config.js'
import { db, stmt } from '../db.js'
import { importRoutes } from './import.js'
import { registrationOpen } from './auth.js'

export const adminRoutes = new Hono<AppEnv>()
adminRoutes.use('*', requireUser, requireAdmin)
adminRoutes.route('/import', importRoutes)

adminRoutes.get('/settings', async (c) => c.json({ registrationOpen: await registrationOpen() }))

adminRoutes.patch('/settings', async (c) => {
  const parsed = z.object({ registrationOpen: z.boolean() }).safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'registrationOpen must be a boolean' }, 400)
  await db.run(
    "INSERT INTO settings (key, value) VALUES ('registration_open', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", parsed.data.registrationOpen ? '1' : '0')
  return c.json({ registrationOpen: parsed.data.registrationOpen })
})

const USER_COLUMNS = 'id, email, name, role, disabled, created_at AS createdAt'

adminRoutes.get('/users', async (c) =>
  c.json({ users: await db.all(`SELECT ${USER_COLUMNS} FROM users ORDER BY created_at, id`) }),
)

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(200),
})

adminRoutes.post('/users', async (c) => {
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Valid email, name and a password of 8+ characters required' }, 400)
  const { email, name, password } = parsed.data
  const exists = await db.get('SELECT 1 FROM users WHERE email = ?', email)
  if (exists) return c.json({ error: 'A user with that email already exists' }, 409)
  const info = await db.run("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'user')", email.toLowerCase(), name, await hashPassword(password))
  const user = await db.get(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, info.lastInsertRowid)
  return c.json({ user }, 201)
})

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    password: z.string().min(8).max(200),
    disabled: z.boolean(),
  })
  .partial()

adminRoutes.patch('/users/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const parsed = patchSchema.safeParse(await c.req.json().catch(() => null))
  if (!Number.isInteger(id) || !parsed.success) return c.json({ error: 'Invalid request' }, 400)
  const target = await db.get('SELECT email FROM users WHERE id = ?', id) as { email: string } | undefined
  if (!target) return c.json({ error: 'User not found' }, 404)
  if (target.email === config.adminEmail) {
    return c.json({ error: 'The admin account is managed through the environment' }, 400)
  }

  const { name, password, disabled } = parsed.data
  if (name !== undefined) await db.run('UPDATE users SET name = ? WHERE id = ?', name, id)
  if (password !== undefined) {
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(password), id)
    await db.run('DELETE FROM sessions WHERE user_id = ?', id)
  }
  if (disabled !== undefined) {
    await db.run('UPDATE users SET disabled = ? WHERE id = ?', disabled ? 1 : 0, id)
    if (disabled) await db.run('DELETE FROM sessions WHERE user_id = ?', id)
  }
  return c.json({ user: await db.get(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, id) })
})

adminRoutes.delete('/users/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const target = await db.get('SELECT email FROM users WHERE id = ?', id) as { email: string } | undefined
  if (!target) return c.json({ error: 'User not found' }, 404)
  if (target.email === config.adminEmail) {
    return c.json({ error: 'The admin account cannot be deleted' }, 400)
  }
  await db.run('DELETE FROM users WHERE id = ?', id)
  return c.json({ ok: true })
})

const RESET_HOURS = 24

// A one-time link the admin hands to a user who forgot their password. Only the newest link per user works.
adminRoutes.post('/users/:id/reset-link', async (c) => {
  const id = Number(c.req.param('id'))
  const target = await db.get('SELECT email FROM users WHERE id = ?', id) as { email: string } | undefined
  if (!target) return c.json({ error: 'User not found' }, 404)
  if (target.email === config.adminEmail) {
    return c.json({ error: 'The admin password is set through the ADMIN_PASSWORD environment variable' }, 400)
  }
  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = Date.now() + RESET_HOURS * 3_600_000
  await db.batch([
    stmt('DELETE FROM password_resets WHERE user_id = ?', id),
    stmt('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(token), id, expiresAt),
  ])
  return c.json({ token, expiresAt })
})
