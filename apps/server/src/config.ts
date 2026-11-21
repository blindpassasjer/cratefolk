import path from 'node:path'

// Read lazily: on Cloudflare Workers the variables and secrets are only available once a request is being handled.
function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable ${name}`)
  return value
}

/** Set by the Cloudflare Worker entry; changes where things like the client's IP address come from. */
export const runtime = { worker: false }

export const config = {
  get port() {
    return Number(process.env.PORT ?? 6170)
  },
  get dataDir() {
    return path.resolve(process.env.DATA_DIR ?? './data')
  },
  get adminEmail() {
    return required('ADMIN_EMAIL').toLowerCase()
  },
  get adminPassword() {
    return required('ADMIN_PASSWORD')
  },
  get discogsToken() {
    return process.env.DISCOGS_TOKEN?.trim() || null
  },
  get cookieSecure() {
    return process.env.COOKIE_SECURE === 'true'
  },
  // Only honour X-Forwarded-For when a reverse proxy you control sets it; otherwise clients can spoof it.
  get trustProxy() {
    return process.env.TRUST_PROXY === 'true'
  },
  get webDir() {
    return path.resolve(process.env.WEB_DIR ?? '../web/dist')
  },
}
