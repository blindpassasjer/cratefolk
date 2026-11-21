// Work that should carry on after the response has gone out (pushes to Discogs, Wikipedia lookups). On Node the process stays alive, so
// the promise just runs; on Cloudflare Workers it is handed to the request's waitUntil so the runtime doesn't cut it short.

type Keeper = (promise: Promise<unknown>) => void
let keep: Keeper = () => {}

export const setBackgroundKeeper = (fn: Keeper) => {
  keep = fn
}

/** Lets `promise` finish without anyone awaiting it. A failure is logged, never thrown into the request that started it. */
export function background(promise: Promise<unknown>, what = 'background task'): void {
  const safe = promise.catch((e: Error) => console.warn(`${what} failed: ${e?.message ?? e}`))
  keep(safe)
}
