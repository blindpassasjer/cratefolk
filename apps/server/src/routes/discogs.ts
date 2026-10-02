import { Hono } from 'hono'
import { requireUser, type AppEnv } from '../auth.js'
import { DiscogsError, searchReleases } from '../discogs.js'

export const discogsRoutes = new Hono<AppEnv>()
discogsRoutes.use('*', requireUser)

discogsRoutes.get('/search', async (c) => {
  const q = c.req.query('q')?.trim() ?? ''
  const catno = c.req.query('catno')?.trim() ?? ''
  const barcode = c.req.query('barcode')?.trim() ?? ''
  if (!q && !catno && !barcode) return c.json({ error: 'Enter something to search for' }, 400)
  try {
    return c.json(
      await searchReleases({
        q,
        catno,
        barcode,
        page: Math.max(1, Number(c.req.query('page')) || 1),
        allFormats: c.req.query('allFormats') === '1',
      }),
    )
  } catch (err) {
    if (err instanceof DiscogsError) return c.json({ error: err.message }, 502)
    throw err
  }
})
