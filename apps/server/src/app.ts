import { Hono } from 'hono'
import { compress } from 'hono/compress'
import { logger } from 'hono/logger'
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

/** The API, shared by the Node server (Docker) and the Cloudflare Worker. Serving the web app is each entry point's own job. */
export function createApi({ compress: gzip = true } = {}): Hono {
  const app = new Hono()
  if (gzip) app.use('/*', compress()) // Cloudflare compresses at its edge, so the Worker turns this off
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
  return app
}
