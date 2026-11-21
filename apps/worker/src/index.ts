import { AsyncLocalStorage } from 'node:async_hooks'
import { createApi } from '../../server/src/app.js'
import { ensureAdmin, purgeExpiredSessions } from '../../server/src/auth.js'
import { setBackgroundKeeper } from '../../server/src/background.js'
import { runtime } from '../../server/src/config.js'
import { runSyncJob, setSyncDispatcher } from '../../server/src/discogsSync.js'
import { purgeOldEvents } from '../../server/src/events.js'
import { useD1 } from './d1.js'
import { useR2Covers } from './r2.js'

export interface Env {
  DB: D1Database
  COVERS: R2Bucket
  IMAGES?: ImagesBinding
  SYNC_QUEUE: Queue<{ userId: number }>
  ASSETS: Fetcher
  [name: string]: unknown
}

// The request's ExecutionContext, so deep code can hand work to waitUntil (see background.ts).
const requestContext = new AsyncLocalStorage<ExecutionContext>()

let admin: Promise<void> | null = null

/** Wires the server code to this isolate's bindings. Cheap to repeat; the admin account is only checked once per isolate. */
function setup(env: Env): Promise<void> {
  runtime.worker = true
  // Plain variables and secrets are read through process.env by the shared code.
  for (const [name, value] of Object.entries(env)) if (typeof value === 'string') process.env[name] = value
  useD1(env.DB)
  useR2Covers(env.COVERS, env.IMAGES)
  setBackgroundKeeper((promise) => requestContext.getStore()?.waitUntil(promise))
  setSyncDispatcher(async (userId) => {
    await env.SYNC_QUEUE.send({ userId })
  })
  // Tables come from `wrangler d1 migrations apply`; this only creates or re-syncs the admin from ADMIN_EMAIL / ADMIN_PASSWORD.
  admin ??= ensureAdmin().catch((e) => {
    admin = null
    throw e
  })
  return admin
}

const api = createApi({ compress: false })

export default {
  async fetch(request, env, ctx): Promise<Response> {
    await setup(env)
    return requestContext.run(ctx, () => api.fetch(request, env, ctx))
  },

  // A Discogs sync can take many minutes (Discogs allows ~1 request a second), far longer than a request may run, so it runs here.
  async queue(batch, env, ctx): Promise<void> {
    await setup(env)
    for (const message of batch.messages) {
      await requestContext.run(ctx, () => runSyncJob(message.body.userId))
      message.ack()
    }
  },

  async scheduled(_event, env, ctx): Promise<void> {
    await setup(env)
    await requestContext.run(ctx, () => Promise.all([purgeExpiredSessions(), purgeOldEvents()]))
  },
} satisfies ExportedHandler<Env, { userId: number }>
