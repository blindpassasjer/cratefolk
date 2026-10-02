import path from 'node:path'

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`Missing required environment variable ${name}`)
    process.exit(1)
  }
  return value
}

export const config = {
  port: Number(process.env.PORT ?? 6170),
  dataDir: path.resolve(process.env.DATA_DIR ?? './data'),
  adminEmail: required('ADMIN_EMAIL').toLowerCase(),
  adminPassword: required('ADMIN_PASSWORD'),
  discogsToken: process.env.DISCOGS_TOKEN?.trim() || null,
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  webDir: path.resolve(process.env.WEB_DIR ?? '../web/dist'),
}
