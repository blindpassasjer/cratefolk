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

const COOKIE = 'cratefolk_session'
// Sessions started before the renames (WaxCrate, then Cratelog) carry an old cookie name; keep honouring them until they expire or are replaced.
const LEGACY_COOKIES = ['cratelog_session', 'waxcrate_session']
const sessionToken = (c: Context) => [COOKIE, ...LEGACY_COOKIES].map((name) => getCookie(c, name)).find(Boolean)
const SESSION_DAYS = 30

interface SessionUser {
  id: number
  email: string
  name: string
  role: 'admin' | 'user'
  currency: string
  shareCollection: number
  shareWishlist: number
  shareActivity: number
  shops: string
  discogsUsername: string | null
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

export async function createSession(c: Context, userId: number): Promise<void> {
  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = Date.now() + SESSION_DAYS * 86_400_000
  await db.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(token),
    userId,
    expiresAt)
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.cookieSecure,
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  })
  for (const name of LEGACY_COOKIES) deleteCookie(c, name, { path: '/' })
}

export async function destroySession(c: Context): Promise<void> {
  const token = sessionToken(c)
  if (token) await db.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token))
  deleteCookie(c, COOKIE, { path: '/' })
  for (const name of LEGACY_COOKIES) deleteCookie(c, name, { path: '/' })
}

/** After a password change: sign out every other device but keep the one making the change. */
export async function destroyOtherSessions(c: Context, userId: number): Promise<void> {
  const token = sessionToken(c)
  await db.run('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', userId, token ? sha256(token) : '')
}

async function lookupUser(c: Context): Promise<SessionUser | null> {
  const token = sessionToken(c)
  if (!token) return null
  const row = await db.get(
      `SELECT u.id, u.email, u.name, u.role, u.currency,
              u.share_collection AS shareCollection, u.share_wishlist AS shareWishlist, u.share_activity AS shareActivity, u.shops,
              u.discogs_username AS discogsUsername
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0`, sha256(token), Date.now()) as SessionUser | undefined
  return row ?? null
}

export type AppEnv = { Variables: { user: SessionUser } }

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await lookupUser(c)
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
  const email = config.adminEmail
  const existing = await db.get<{ id: number; password_hash: string; role: string; disabled: number }>('SELECT id, password_hash, role, disabled FROM users WHERE email = ?', email)
  if (!existing) {
    await db.run("INSERT INTO users (email, name, password_hash, role) VALUES (?, 'Admin', ?, 'admin')", email, await hashPassword(config.adminPassword))
  } else if (existing.role !== 'admin' || existing.disabled || !(await verifyPassword(config.adminPassword, existing.password_hash))) {
    await db.run("UPDATE users SET password_hash = ?, role = 'admin', disabled = 0 WHERE id = ?", await hashPassword(config.adminPassword), existing.id)
  }
  // If ADMIN_EMAIL was changed, the previous admin must not keep its role (and old password).
  await db.run("UPDATE users SET role = 'user' WHERE role = 'admin' AND email != ?", email)
}

export async function purgeExpiredSessions(): Promise<void> {
  await db.run('DELETE FROM login_failures WHERE reset_at <= ?', Date.now())
  await db.run('DELETE FROM sessions WHERE expires_at <= ?', Date.now())
  await db.run('DELETE FROM password_resets WHERE expires_at <= ?', Date.now())
}
