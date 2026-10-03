import crypto from 'node:crypto'
import { promisify } from 'node:util'
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { config } from './config.js'
import { db } from './db.js'

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>

const COOKIE = 'cratelog_session'
// Sessions started before the 0.4.0 rename carry the old cookie name; keep honouring it until it expires or is replaced.
const LEGACY_COOKIE = 'waxcrate_session'
const sessionToken = (c: Context) => getCookie(c, COOKIE) ?? getCookie(c, LEGACY_COOKIE)
const SESSION_DAYS = 30

interface SessionUser {
  id: number
  email: string
  name: string
  role: 'admin' | 'user'
  currency: string
  shareCollection: number
  shareWishlist: number
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16)
  const key = await scrypt(password, salt, 64)
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split('$')
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false
  const expected = Buffer.from(keyHex, 'hex')
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length)
  return crypto.timingSafeEqual(actual, expected)
}

export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex')

export function createSession(c: Context, userId: number): void {
  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = Date.now() + SESSION_DAYS * 86_400_000
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
    sha256(token),
    userId,
    expiresAt,
  )
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.cookieSecure,
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  })
  deleteCookie(c, LEGACY_COOKIE, { path: '/' })
}

export function destroySession(c: Context): void {
  const token = sessionToken(c)
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token))
  deleteCookie(c, COOKIE, { path: '/' })
  deleteCookie(c, LEGACY_COOKIE, { path: '/' })
}

/** After a password change: sign out every other device but keep the one making the change. */
export function destroyOtherSessions(c: Context, userId: number): void {
  const token = sessionToken(c)
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, token ? sha256(token) : '')
}

function lookupUser(c: Context): SessionUser | null {
  const token = sessionToken(c)
  if (!token) return null
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.currency,
              u.share_collection AS shareCollection, u.share_wishlist AS shareWishlist
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0`,
    )
    .get(sha256(token), Date.now()) as SessionUser | undefined
  return row ?? null
}

export type AppEnv = { Variables: { user: SessionUser } }

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = lookupUser(c)
  if (!user) return c.json({ error: 'Not signed in' }, 401)
  c.set('user', user)
  await next()
}

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('user').role !== 'admin') return c.json({ error: 'Admin only' }, 403)
  await next()
}

/** Creates the admin from env, or re-syncs its password/role so the env stays the source of truth. */
export async function ensureAdmin(): Promise<void> {
  const hash = await hashPassword(config.adminPassword)
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(config.adminEmail) as
    | { id: number }
    | undefined
  if (existing) {
    db.prepare(
      "UPDATE users SET password_hash = ?, role = 'admin', disabled = 0 WHERE id = ?",
    ).run(hash, existing.id)
  } else {
    db.prepare(
      "INSERT INTO users (email, name, password_hash, role) VALUES (?, 'Admin', ?, 'admin')",
    ).run(config.adminEmail, hash)
  }
  // If ADMIN_EMAIL was changed, the previous admin must not keep its role (and old password).
  db.prepare("UPDATE users SET role = 'user' WHERE role = 'admin' AND email != ?").run(config.adminEmail)
}

export function purgeExpiredSessions(): void {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())
  db.prepare('DELETE FROM password_resets WHERE expires_at <= ?').run(Date.now())
}
