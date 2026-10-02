import { Hono } from 'hono'
import { z } from 'zod'
import { hashPassword, requireAdmin, requireUser, type AppEnv } from '../auth.js'
import { config } from '../config.js'
import { db } from '../db.js'

export const adminRoutes = new Hono<AppEnv>()
adminRoutes.use('*', requireUser, requireAdmin)

const USER_COLUMNS = 'id, email, name, role, disabled, created_at AS createdAt'

adminRoutes.get('/users', (c) =>
  c.json({ users: db.prepare(`SELECT ${USER_COLUMNS} FROM users ORDER BY created_at, id`).all() }),
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
  const exists = db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)
  if (exists) return c.json({ error: 'A user with that email already exists' }, 409)
  const info = db
    .prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'user')")
    .run(email.toLowerCase(), name, await hashPassword(password))
  const user = db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(info.lastInsertRowid)
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
  const target = db.prepare('SELECT email FROM users WHERE id = ?').get(id) as { email: string } | undefined
  if (!target) return c.json({ error: 'User not found' }, 404)
  if (target.email === config.adminEmail) {
    return c.json({ error: 'The admin account is managed through the environment' }, 400)
  }

  const { name, password, disabled } = parsed.data
  if (name !== undefined) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, id)
  if (password !== undefined) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(password), id)
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
  }
  if (disabled !== undefined) {
    db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(disabled ? 1 : 0, id)
    if (disabled) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
  }
  return c.json({ user: db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(id) })
})

adminRoutes.delete('/users/:id', (c) => {
  const id = Number(c.req.param('id'))
  const target = db.prepare('SELECT email FROM users WHERE id = ?').get(id) as { email: string } | undefined
  if (!target) return c.json({ error: 'User not found' }, 404)
  if (target.email === config.adminEmail) {
    return c.json({ error: 'The admin account cannot be deleted' }, 400)
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
  return c.json({ ok: true })
})
