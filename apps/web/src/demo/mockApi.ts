import { ApiError, type AdminUser, type Copy, type ReleaseDetail, type SearchResult, type WishItem } from '../api'
import { CATALOG, RELEASES, seedState, type DemoState, type StoredCopy } from './seed'

// In-browser stand-in for the server, used by the GitHub Pages demo (VITE_DEMO=true).
// Same paths and response shapes as apps/server/src/routes/*; state lives in localStorage.

const KEY = 'waxcrate-demo-v1'
let state: DemoState | null = null

function load(): DemoState {
  if (state) return state
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return (state = JSON.parse(raw) as DemoState)
  } catch {
    /* storage unavailable: fall through to a fresh in-memory demo */
  }
  return (state = seedState())
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

export function resetDemo() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  state = null
}

type Body = Record<string, unknown>
type Handler = (m: RegExpMatchArray, q: URLSearchParams, body: Body) => unknown

const routes: Array<[string, RegExp, Handler]> = []
const on = (method: string, pattern: string, fn: Handler) =>
  routes.push([method, new RegExp(`^${pattern.replace(/:\w+/g, '([^/]+)')}$`), fn])

const fail = (message: string, status = 400): never => {
  throw new ApiError(message, status)
}
const release = (id: number): ReleaseDetail => RELEASES.get(id) ?? fail('Release not found', 404)
const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name)
const byArtist = (a: { artist: string; title: string }, b: { artist: string; title: string }) =>
  a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title)

function releaseFields(r: ReleaseDetail) {
  return { releaseId: r.id, title: r.title, artist: r.artist, year: r.year, country: r.country, label: r.label, catno: r.catno, format: r.format, barcode: r.barcode, hasCover: r.hasCover }
}

function copyRow(c: StoredCopy): Copy {
  const s = load()
  return {
    ...releaseFields(release(c.releaseId)),
    copyId: c.id,
    mediaCondition: c.mediaCondition as Copy['mediaCondition'],
    sleeveCondition: c.sleeveCondition as Copy['sleeveCondition'],
    notes: c.notes,
    addedAt: c.addedAt,
    forSale: c.forSale ? 1 : 0,
    askingPrice: c.askingPrice,
    priceCurrency: c.priceCurrency,
    collectionIds: s.groupCopies.filter((g) => g.copyId === c.id).map((g) => g.groupId),
  }
}

const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ')
const ownedCopy = (id: string | undefined) => load().copies.find((c) => c.id === Number(id)) ?? fail('Copy not found', 404)
const nextId = () => load().nextId++

function addCopy(releaseId: number, notes: string | null = null, grades: Partial<StoredCopy> = {}) {
  const s = load()
  const copy: StoredCopy = { id: nextId(), releaseId, mediaCondition: null, sleeveCondition: null, notes, addedAt: now(), forSale: false, askingPrice: null, priceCurrency: null, ...grades }
  s.copies.push(copy)
  return copy
}

// ---- auth ----
on('GET', '/auth/me', () => {
  const s = load()
  if (!s.signedIn) fail('Not signed in', 401)
  return { user: { id: 1, email: s.me.email, name: s.me.name, role: 'admin', currency: s.me.currency } }
})
on('POST', '/auth/login', () => {
  load().signedIn = true // the demo accepts any credentials
  return { ok: true }
})
on('POST', '/auth/logout', () => {
  load().signedIn = false
  return { ok: true }
})
on('PATCH', '/auth/me', (_m, _q, b) => {
  const me = load().me
  if (typeof b.name === 'string') me.name = b.name
  if (typeof b.email === 'string') me.email = b.email.toLowerCase()
  if (typeof b.currency === 'string') me.currency = b.currency
  return { ok: true }
})
on('POST', '/auth/password', () => ({ ok: true }))

// ---- collection ----
on('GET', '/collection', (_m, q) => {
  const s = load()
  const group = Number(q.get('collection')) || null
  const rows = s.copies
    .filter((c) => !group || s.groupCopies.some((g) => g.groupId === group && g.copyId === c.id))
    .filter((c) => q.get('forSale') !== '1' || c.forSale)
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt) || b.id - a.id)
  return { copies: rows.map(copyRow) }
})
on('POST', '/collection', (_m, _q, b) => {
  const s = load()
  const releaseId = Number(b.releaseId)
  release(releaseId)
  s.wishlist = s.wishlist.filter((w) => w.releaseId !== releaseId)
  return { copy: copyRow(addCopy(releaseId)) }
})
on('PATCH', '/collection/:id', (m, _q, b) => {
  const c = ownedCopy(m[1])
  if ('mediaCondition' in b) c.mediaCondition = (b.mediaCondition as string | null) ?? null
  if ('sleeveCondition' in b) c.sleeveCondition = (b.sleeveCondition as string | null) ?? null
  if ('notes' in b) c.notes = (b.notes as string | null) ?? null
  if (typeof b.forSale === 'boolean') c.forSale = b.forSale
  if ('askingPrice' in b) {
    c.askingPrice = (b.askingPrice as number | null) ?? null
    c.priceCurrency = c.askingPrice === null ? null : load().me.currency
  }
  return { copy: copyRow(c) }
})
on('DELETE', '/collection/:id', (m) => {
  const s = load()
  const c = ownedCopy(m[1])
  s.copies = s.copies.filter((x) => x !== c)
  s.groupCopies = s.groupCopies.filter((g) => g.copyId !== c.id)
  return { ok: true }
})

on('GET', '/releases/:id', (m) => {
  const s = load()
  const id = Number(m[1])
  const r = release(id)
  const wished = s.wishlist.find((w) => w.releaseId === id)
  return {
    wishlisted: wished ? { id: wished.id, notes: wished.notes } : null,
    release: r,
    copies: s.copies.filter((c) => c.releaseId === id).sort((a, b) => a.id - b.id).map(copyRow),
  }
})

// ---- collections (crates) ----
const groupRow = (g: { id: number; name: string }) => ({ ...g, count: load().groupCopies.filter((x) => x.groupId === g.id).length })
const cleanName = (b: Body) => String(b.name ?? '').trim().slice(0, 60) || fail('Give the crate a name (up to 60 characters)')
const group = (id: string | undefined) => load().groups.find((g) => g.id === Number(id)) ?? fail('Crate not found', 404)
const clash = (name: string, except?: number) =>
  load().groups.some((g) => g.id !== except && g.name.toLowerCase() === name.toLowerCase()) && fail('You already have a crate with that name', 409)

on('GET', '/collections', () => ({ collections: [...load().groups].sort(byName).map(groupRow) }))
on('POST', '/collections', (_m, _q, b) => {
  const name = cleanName(b)
  clash(name)
  const g = { id: nextId(), name }
  load().groups.push(g)
  return { collection: groupRow(g) }
})
on('PATCH', '/collections/:id', (m, _q, b) => {
  const g = group(m[1])
  const name = cleanName(b)
  clash(name, g.id)
  g.name = name
  return { collection: groupRow(g) }
})
on('DELETE', '/collections/:id', (m) => {
  const s = load()
  const g = group(m[1])
  s.groups = s.groups.filter((x) => x !== g)
  s.groupCopies = s.groupCopies.filter((x) => x.groupId !== g.id)
  s.shares = s.shares.filter((x) => x.groupId !== g.id)
  return { ok: true }
})
on('PUT', '/collections/:id/copies/:copyId', (m) => {
  const s = load()
  const g = group(m[1])
  const c = ownedCopy(m[2])
  if (!s.groupCopies.some((x) => x.groupId === g.id && x.copyId === c.id)) s.groupCopies.push({ groupId: g.id, copyId: c.id })
  return { ok: true }
})
on('DELETE', '/collections/:id/copies/:copyId', (m) => {
  const s = load()
  s.groupCopies = s.groupCopies.filter((x) => !(x.groupId === Number(m[1]) && x.copyId === Number(m[2])))
  return { ok: true }
})

// ---- wishlist ----
const wishRow = (w: DemoState['wishlist'][number]): WishItem => ({
  ...releaseFields(release(w.releaseId)),
  wishId: w.id,
  notes: w.notes,
  addedAt: w.addedAt,
})
on('GET', '/wishlist', () => ({ items: [...load().wishlist].sort((a, b) => b.addedAt.localeCompare(a.addedAt) || b.id - a.id).map(wishRow) }))
on('POST', '/wishlist', (_m, _q, b) => {
  const s = load()
  const releaseId = Number(b.releaseId)
  release(releaseId)
  let w = s.wishlist.find((x) => x.releaseId === releaseId)
  if (!w) s.wishlist.push((w = { id: nextId(), releaseId, notes: null, addedAt: now() }))
  return { item: wishRow(w) }
})
on('DELETE', '/wishlist/:id', (m) => {
  const s = load()
  s.wishlist = s.wishlist.filter((w) => w.id !== Number(m[1]))
  return { ok: true }
})
on('POST', '/wishlist/:id/acquire', (m) => {
  const s = load()
  const w = s.wishlist.find((x) => x.id === Number(m[1])) ?? fail('Wishlist item not found', 404)
  s.wishlist = s.wishlist.filter((x) => x !== w)
  return { copyId: addCopy(w.releaseId, w.notes).id }
})
on('GET', '/status', (_m, q) => {
  const s = load()
  const ids = (q.get('ids') ?? '').split(',').map(Number).filter((n) => n > 0)
  const owned: Record<number, number> = {}
  for (const id of ids) {
    const n = s.copies.filter((c) => c.releaseId === id).length
    if (n) owned[id] = n
  }
  return { owned, wishlisted: ids.filter((id) => s.wishlist.some((w) => w.releaseId === id)) }
})

// ---- discogs + market (made up: the demo never leaves the browser) ----
on('GET', '/discogs/search', (_m, q) => {
  const fold = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const words = fold(q.get('q') ?? '').split(/\s+/).filter(Boolean)
  const catno = fold(q.get('catno') ?? '').replace(/\s+/g, '')
  const barcode = (q.get('barcode') ?? '').replace(/\s+/g, '')
  const results: SearchResult[] = CATALOG.filter((r) => {
    const hay = fold(`${r.artist} ${r.title} ${r.label} ${r.year}`)
    return words.every((w) => hay.includes(w)) && (!catno || fold(r.catno ?? '').replace(/\s+/g, '').includes(catno)) && (!barcode || r.barcode === barcode)
  }).map((r) => ({ id: r.id, artist: r.artist, title: r.title, year: r.year, country: r.country, format: r.format, label: r.label, catno: r.catno, barcode: r.barcode, thumb: null }))
  return { results, page: 1, pages: 1, items: results.length }
})
on('GET', '/market/:id', (m) => {
  const id = Number(m[1])
  const r = release(id)
  return {
    numForSale: (id * 7) % 23 + 2,
    lowestPrice: 9 + ((id * 13) % 40),
    currency: 'USD',
    url: `https://www.discogs.com/search/?type=release&q=${encodeURIComponent(`${r.artist} ${r.title}`)}`,
  }
})

// ---- sharing ----
const target = (kind: unknown, collection: unknown) => ({
  kind: kind as DemoState['shares'][number]['kind'],
  groupId: kind === 'group' ? Number(collection) || null : null,
})
const findShare = (kind: unknown, collection: unknown) => {
  const t = target(kind, collection)
  return load().shares.find((x) => x.kind === t.kind && x.groupId === t.groupId)
}
on('GET', '/shares', (_m, q) => ({ share: findShare(q.get('kind'), q.get('collection')) ?? null }))
on('POST', '/shares', (_m, _q, b) => {
  const existing = findShare(b.kind, b.collectionId)
  if (existing) return { share: existing }
  const share = { token: Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12), ...target(b.kind, b.collectionId) }
  load().shares.push(share)
  return { share }
})
on('DELETE', '/shares/:token', (m) => {
  const s = load()
  s.shares = s.shares.filter((x) => x.token !== m[1])
  return { ok: true }
})
on('GET', '/shared/:token', (m) => {
  const s = load()
  const share = s.shares.find((x) => x.token === m[1]) ?? fail('This link is no longer available', 404)
  const owner = s.me.name
  if (share.kind === 'wishlist') {
    return { title: 'Wishlist', owner, kind: share.kind, items: s.wishlist.map((w) => ({ ...releaseFields(release(w.releaseId)), copies: 1 })).sort(byArtist) }
  }
  if (share.kind === 'forsale') {
    const items = s.copies.filter((c) => c.forSale).map((c) => ({ ...releaseFields(release(c.releaseId)), copies: 1, copyId: c.id, mediaCondition: c.mediaCondition, sleeveCondition: c.sleeveCondition, askingPrice: c.askingPrice, priceCurrency: c.priceCurrency }))
    return { title: 'For sale', owner, kind: share.kind, items: items.sort(byArtist) }
  }
  const inScope = s.copies.filter((c) => share.kind === 'all' || s.groupCopies.some((g) => g.groupId === share.groupId && g.copyId === c.id))
  const counts = new Map<number, number>()
  for (const c of inScope) counts.set(c.releaseId, (counts.get(c.releaseId) ?? 0) + 1)
  const items = [...counts].map(([id, copies]) => ({ ...releaseFields(release(id)), copies })).sort(byArtist)
  const title = share.kind === 'group' ? (s.groups.find((g) => g.id === share.groupId)?.name ?? 'Collection') : 'Collection'
  return { title, owner, kind: share.kind, items }
})

// ---- admin ----
const adminRow = (u: DemoState['users'][number]): AdminUser => u
const userById = (id: string | undefined) => load().users.find((u) => u.id === Number(id)) ?? fail('User not found', 404)
on('GET', '/admin/users', () => ({ users: load().users.map(adminRow) }))
on('POST', '/admin/users', (_m, _q, b) => {
  const s = load()
  const email = String(b.email ?? '').trim().toLowerCase()
  if (!email || !b.name || String(b.password ?? '').length < 8) fail('Valid email, name and a password of 8+ characters required')
  if (s.users.some((u) => u.email === email)) fail('A user with that email already exists', 409)
  const user = { id: nextId(), email, name: String(b.name), role: 'user' as const, currency: 'USD', disabled: 0, createdAt: now() }
  s.users.push(user)
  return { user }
})
on('PATCH', '/admin/users/:id', (m, _q, b) => {
  const u = userById(m[1])
  if (u.role === 'admin') fail('The admin account is managed through the environment')
  if (typeof b.name === 'string') u.name = b.name
  if (typeof b.disabled === 'boolean') u.disabled = b.disabled ? 1 : 0
  return { user: u }
})
on('DELETE', '/admin/users/:id', (m) => {
  const u = userById(m[1])
  if (u.role === 'admin') fail('The admin account cannot be deleted')
  load().users = load().users.filter((x) => x !== u)
  return { ok: true }
})

export async function mockApi<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const url = new URL(path, 'http://demo')
  const method = (init?.method ?? 'GET').toUpperCase()
  for (const [m, re, fn] of routes) {
    const match = m === method && url.pathname.match(re)
    if (!match) continue
    const result = fn(match, url.searchParams, (init?.json ?? {}) as Body)
    save()
    return structuredClone(result) as T
  }
  throw new ApiError('Not available in the demo', 404)
}
