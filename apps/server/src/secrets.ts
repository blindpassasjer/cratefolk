import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'

// Credentials we must be able to read back (users' Discogs tokens) are encrypted with AES-256-GCM.
// The key is generated on first use and kept in the data directory (SECRET_KEY overrides it), so it
// travels with your backups of data/ but is never in the database itself.
function loadKey(): Buffer {
  if (process.env.SECRET_KEY?.trim()) return crypto.createHash('sha256').update(process.env.SECRET_KEY.trim()).digest()
  const file = path.join(config.dataDir, 'secret.key')
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('base64'), { mode: 0o600 })
  return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64')
}

let key: Buffer | null = null

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
