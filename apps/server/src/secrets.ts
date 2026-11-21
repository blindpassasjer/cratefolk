import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { config, runtime } from './config.js'
import { db } from './db.js'

// Credentials we must be able to read back (users' Discogs tokens) are encrypted with AES-256-GCM.
// The key is generated on first use and kept in the data directory (SECRET_KEY overrides it), so it
// travels with your backups of data/ but is never in the database itself.
// SECRET_KEY_RAW is the contents of an existing data/secret.key (base64): it's how an instance that moves to Cloudflare
// Workers (which has no data directory) keeps being able to read the Discogs tokens it already stored.
function loadKey(): Buffer {
  if (process.env.SECRET_KEY?.trim()) return crypto.createHash('sha256').update(process.env.SECRET_KEY.trim()).digest()
  if (process.env.SECRET_KEY_RAW?.trim()) {
    const raw = Buffer.from(process.env.SECRET_KEY_RAW.trim(), 'base64')
    if (raw.length !== 32) throw new Error('SECRET_KEY_RAW must be the base64 of 32 bytes (the contents of data/secret.key)')
    return raw
  }
  const file = path.join(config.dataDir, 'secret.key')
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('base64'), { mode: 0o600 })
  return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64')
}

let key: Buffer | null = null

/**
 * Cloudflare Workers have no data directory to keep a generated key in, so unless SECRET_KEY / SECRET_KEY_RAW is set, a random key is made once
 * and kept in the database (settings table). That protects tokens from anyone who only sees an export of the other columns, not from
 * someone who can read the whole database: set SECRET_KEY if that matters to you. Call once at start-up; elsewhere the key loads lazily.
 */
export async function prepareKey(): Promise<void> {
  if (key) return
  if (!runtime.worker || process.env.SECRET_KEY?.trim() || process.env.SECRET_KEY_RAW?.trim()) {
    key = loadKey()
    return
  }
  let row = await db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'secret_key'")
  if (!row) {
    await db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('secret_key', ?)", crypto.randomBytes(32).toString('base64'))
    row = await db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'secret_key'")
  }
  key = Buffer.from(row!.value, 'base64')
}

/** Decrypts a value that was encrypted under another instance's key (the contents of its data/secret.key, base64) and encrypts it under this one's. */
export function reencrypt(stored: string, oldKeyBase64: string): string {
  const oldKey = Buffer.from(oldKeyBase64.trim(), 'base64')
  if (oldKey.length !== 32) throw new Error('The old key must be the contents of secret.key')
  const [iv, tag, data] = stored.split('.').map((b) => Buffer.from(b, 'base64')) as [Buffer, Buffer, Buffer]
  const decipher = crypto.createDecipheriv('aes-256-gcm', oldKey, iv)
  decipher.setAuthTag(tag)
  return encrypt(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8'))
}

export function encrypt(plain: string): string {
  key ??= loadKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.')
}

export function decrypt(stored: string): string {
  key ??= loadKey()
  const [iv, tag, data] = stored.split('.').map((b) => Buffer.from(b, 'base64')) as [Buffer, Buffer, Buffer]
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}
