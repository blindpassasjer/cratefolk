import fs from 'node:fs'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { compress } from 'hono/compress'
import { logger } from 'hono/logger'
import { ensureAdmin, purgeExpiredSessions } from './auth.js'
import { purgeOldEvents } from './events.js'
import { config } from './config.js'
import { migrate } from './db.js'
import { adminRoutes } from './routes/admin.js'
import { authRoutes } from './routes/auth.js'
import { collectionRoutes, releaseRoutes } from './routes/collection.js'
import { exportRoutes } from './routes/export.js'
import { groupRoutes } from './routes/groups.js'
import { statsRoutes } from './routes/stats.js'
import { publicShareRoutes, shareRoutes } from './routes/share.js'
import { discogsRoutes } from './routes/discogs.js'
import { friendRoutes } from './routes/friends.js'
import { marketRoutes, statusRoutes, wishlistRoutes } from './routes/wishlist.js'

migrate()
await ensureAdmin()
purgeExpiredSessions()
setInterval(purgeExpiredSessions, 6 * 3_600_000).unref()
purgeOldEvents()
setInterval(purgeOldEvents, 24 * 3_600_000).unref()

const app = new Hono()
app.use('/*', compress())
app.use('/api/*', logger())
app.get('/api/health', (c) => c.json({ ok: true }))
app.route('/api/auth', authRoutes)
app.route('/api/admin', adminRoutes)
app.route('/api/discogs', discogsRoutes)
app.route('/api/collection', collectionRoutes)
app.route('/api/collections', groupRoutes)
app.route('/api/export', exportRoutes)
app.route('/api/shares', shareRoutes)
app.route('/api/shared', publicShareRoutes)
app.route('/api/releases', releaseRoutes)
app.route('/api/wishlist', wishlistRoutes)
app.route('/api/status', statusRoutes)
app.route('/api/stats', statsRoutes)
app.route('/api/market', marketRoutes)
app.route('/api/friends', friendRoutes)
app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))

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
