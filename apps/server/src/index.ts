import fs from 'node:fs'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createApi } from './app.js'
import { ensureAdmin, purgeExpiredSessions } from './auth.js'
import { config } from './config.js'
import { useFileCovers } from './covers.node.js'
import { openNodeDatabase } from './db.node.js'
import { purgeOldEvents } from './events.js'

for (const name of ['ADMIN_EMAIL', 'ADMIN_PASSWORD']) {
  if (!process.env[name]?.trim()) {
    console.error(`Missing required environment variable ${name}`)
    process.exit(1)
  }
}

openNodeDatabase()
useFileCovers()
await ensureAdmin()
const purge = () => Promise.all([purgeExpiredSessions(), purgeOldEvents()]).catch((e: Error) => console.warn(`Cleanup failed: ${e.message}`))
await purge()
setInterval(purge, 6 * 3_600_000).unref()

const app = createApi()

// In production the server also serves the built web app (SPA fallback to index.html).
if (fs.existsSync(path.join(config.webDir, 'index.html'))) {
  const root = path.relative(process.cwd(), config.webDir)
  const indexHtml = fs.readFileSync(path.join(config.webDir, 'index.html'), 'utf8')
  app.use('/*', serveStatic({ root }))
  app.get('*', (c) => c.html(indexHtml))
}

serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  console.log(`Cratefolk listening on http://localhost:${port}`)
})
