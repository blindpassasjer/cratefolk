import { ApiError, type AdminUser, type Copy, type ReleaseDetail, type SearchResult, type Stats, type WishItem } from '../api'
import { CATALOG, RELEASES, seedState, type DemoState, type StoredCopy } from './seed'

// In-browser stand-in for the server, used by the GitHub Pages demo (VITE_DEMO=true).
// Same paths and response shapes as apps/server/src/routes/*; state lives in localStorage.

const KEY = 'cratelog-demo-v1'
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
const release = (id: number): ReleaseDetail =>
  RELEASES.get(id) ?? load().manual?.find((m) => m.release.id === id)?.release ?? fail('Release not found', 404)

/** Cover of a hand-added record, for Cover.tsx (the demo has no image endpoint). */
export const manualCover = (id: number): string | null => (id < 0 ? (load().manual?.find((m) => m.release.id === id)?.cover ?? null) : null)
const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name)
const byArtist = (a: { artist: string; title: string }, b: { artist: string; title: string }) =>
  a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title)

function releaseFields(r: ReleaseDetail) {
  return { releaseId: r.id, title: r.title, artist: r.artist, year: r.year, country: r.country, label: r.label, catno: r.catno, format: r.format, barcode: r.barcode, tracks: r.tracklist.map((t) => t.title).join(' / ') || null, hasCover: r.hasCover }
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
    ownerId: 1,
    coOwnerId: c.coOwnerId ?? null,
    ownerName: s.me.name,
    coOwnerName: s.users.find((u) => u.id === c.coOwnerId)?.name ?? null,
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
  return { user: { id: 1, email: s.me.email, name: s.me.name, role: 'admin', currency: s.me.currency, shareCollection: s.me.shareCollection ? 1 : 0, shareWishlist: s.me.shareWishlist ? 1 : 0, shareActivity: s.me.shareActivity === false ? 0 : 1, shops: s.me.shops ?? 'ebay,bandcamp' } }
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
  if (typeof b.shareCollection === 'boolean') me.shareCollection = b.shareCollection
  if (typeof b.shareWishlist === 'boolean') me.shareWishlist = b.shareWishlist
  if (typeof b.shareActivity === 'boolean') me.shareActivity = b.shareActivity
  if (Array.isArray(b.shops)) me.shops = b.shops.join(',')
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
  if ('coOwnerId' in b) c.coOwnerId = (b.coOwnerId as number | null) ?? null
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

const str = (v: unknown) => String(v ?? '').trim() || null

/** The editable fields of a hand-added record, validated like the server does. */
function manualFields(b: Body) {
  const title = str(b.title)
  const artist = str(b.artist)
  if (!title || !artist) fail('Title and artist are required')
  const year = Number(b.year)
  if (b.year != null && b.year !== '' && !(Number.isInteger(year) && year >= 1850 && year <= 2200)) fail('Year must be between 1850 and 2200')
  return {
    title: title!, artist: artist!, year: b.year == null || b.year === '' ? null : year,
    country: str(b.country), label: str(b.label), catno: str(b.catno), barcode: str(b.barcode), format: str(b.format) ?? '',
    genres: (b.genres as string[] | undefined) ?? [], tracklist: (b.tracklist as ReleaseDetail['tracklist'] | undefined) ?? [],
    notes: str(b.notes),
  }
}

on('POST', '/releases/manual', (_m, _q, b) => {
  const s = load()
  const f = manualFields(b)
  const manual = (s.manual ??= [])
  const dupe = manual.find((m) => m.release.artist.toLowerCase() === f.artist.toLowerCase() && m.release.title.toLowerCase() === f.title.toLowerCase())
  if (dupe && !b.force) fail(`You already added “${f.title}” by ${f.artist}`, 409)
  const id = Math.min(0, ...manual.map((m) => m.release.id)) - 1
  manual.push({
    cover: typeof b.cover === 'string' ? b.cover : null,
    release: { id, masterId: null, ...f, styles: [], hasCover: typeof b.cover === 'string' ? 1 : 0 },
  })
  return { releaseId: id }
})
const manualRecord = (id: string | undefined) => load().manual?.find((m) => m.release.id === Number(id)) ?? fail('Release not found', 404)
on('PATCH', '/releases/:id', (m, _q, b) => {
  const rec = manualRecord(m[1])
  Object.assign(rec.release, manualFields(b))
  if (typeof b.cover === 'string') rec.cover = b.cover
  else if (b.cover === null) rec.cover = null
  rec.release.hasCover = rec.cover ? 1 : 0
  return { ok: true }
})
on('DELETE', '/releases/:id', (m) => {
  const s = load()
  const rec = manualRecord(m[1])
  const gone = new Set(s.copies.filter((c) => c.releaseId === rec.release.id).map((c) => c.id))
  s.copies = s.copies.filter((c) => !gone.has(c.id))
  s.groupCopies = s.groupCopies.filter((g) => !gone.has(g.copyId))
  s.wishlist = s.wishlist.filter((w) => w.releaseId !== rec.release.id)
  s.manual = s.manual!.filter((x) => x !== rec)
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

// The real app looks these up on Wikipedia; the demo has no server, so a few records carry fixed examples.
const wiki = (page: string, title: string, facts: string[]) => ({ source: 'album' as const, facts, title, url: `https://en.wikipedia.org/wiki/${page}` })
const TRIVIA: Record<number, ReturnType<typeof wiki>> = {
  1001: wiki('Kind_of_Blue', 'Kind of Blue', [
    "The album was recorded at Columbia's 30th Street Studio in New York City in two sessions on March 2 and April 22, 1959.",
    'The first release with a producer credit was the 1987 CD, which credited only Macero.',
  ]),
  1009: wiki('The_Dark_Side_of_the_Moon', 'The Dark Side of the Moon', [
    'After a change in chart methodology in 2009, which allowed catalogue titles to be included in the Billboard 200, The Dark Side of the Moon returned to the chart at number 189 on 12 December of that year for its 742nd charting week.',
  ]),
  1010: wiki('Rumours_(album)', 'Rumours (album)', [
    "After a debut at number seven, Rumours peaked at the top of the UK Albums Chart in January 1978, becoming Fleetwood Mac's first number one album in the country.",
    'In February, the band and co-producers Caillat and Dashut won the 1978 Grammy Award for Album of the Year.',
  ]),
}
// Any other record gets facts from its own data, as the real server does when Wikipedia has nothing.
on('GET', '/releases/:id/trivia', (m) => {
  const id = Number(m[1])
  if (TRIVIA[id]) return { trivia: TRIVIA[id] }
  const r = release(id)
  const age = new Date().getFullYear() - (r.year ?? NaN)
  const facts = [
    r.year ? `Released in ${r.year}, this record is ${age} ${age === 1 ? 'year' : 'years'} old.` : '',
    r.tracklist.length > 1 ? `It has ${r.tracklist.length} tracks.` : '',
    r.label && r.country ? `This edition came out on ${r.label} in ${r.country}.` : '',
  ].filter(Boolean)
  return { trivia: { source: 'data', facts: facts.length ? facts : [`Nothing more is known about “${r.title}” by ${r.artist} yet.`], title: null, url: null } }
})

// ---- collections (crates) ----
const groupRow = (g: { id: number; name: string }) => ({ ...g, count: load().groupCopies.filter((x) => x.groupId === g.id).length })
const cleanName = (b: Body) => String(b.name ?? '').trim().slice(0, 60) || fail('Give the crate a name (up to 60 characters)')
const group = (id: string | undefined) => load().groups.find((g) => g.id === Number(id)) ?? fail('Crate not found', 404)
const clash = (name: string, except?: number) =>
  load().groups.some((g) => g.id !== except && g.name.toLowerCase() === name.toLowerCase()) && fail('You already have a crate with that name', 409)

on('GET', '/collections', () => ({
  collections: [...load().groups].sort(byName).map(groupRow),
  totals: { records: load().copies.length, forSale: load().copies.filter((c) => c.forSale).length },
}))
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

// ---- friends ----
// The demo has a single real user, so there is nobody else's collection to browse.
on('GET', '/friends', () => ({ friends: [] }))
on('GET', '/friends/users', () => ({ users: load().users.filter((u) => u.id !== 1).map((u) => ({ id: u.id, name: u.name })) }))

// Made-up friends so the demo's feed has something to show. Times are relative to now.
const DEMO_FEED: Array<[user: string, type: 'added' | 'wishlisted' | 'listed' | 'sold', releaseId: number, minutesAgo: number]> = [
  ['Maya', 'added', 1005, 12],
  ['Sam', 'listed', 1003, 55],
  ['Jonas', 'wishlisted', 1009, 3 * 60],
  ['Maya', 'sold', 1006, 7 * 60],
  ['Sam', 'added', 1001, 26 * 60],
  ['Jonas', 'listed', 1004, 2 * 24 * 60],
  ['Maya', 'wishlisted', 1002, 3 * 24 * 60],
]
on('GET', '/friends/feed', () => ({
  events: DEMO_FEED.map(([userName, type, releaseId, minutesAgo], i) => {
    const r = release(releaseId)
    return { id: i + 1, type, createdAt: Date.now() - minutesAgo * 60_000, userId: 100 + i, userName, releaseId, title: r.title, artist: r.artist, hasCover: r.hasCover }
  }),
}))
on('POST', '/collection/:id/sold', (m) => {
  const s = load()
  const c = ownedCopy(m[1])
  s.copies = s.copies.filter((x) => x !== c)
  s.groupCopies = s.groupCopies.filter((g) => g.copyId !== c.id)
  return { ok: true }
})

// ---- admin ----
let demoRegistrationOpen = false
on('GET', '/auth/registration-status', () => ({ open: demoRegistrationOpen }))
on('GET', '/admin/settings', () => ({ registrationOpen: demoRegistrationOpen }))
on('PATCH', '/admin/settings', (_m, _q, b) => {
  demoRegistrationOpen = !!b.registrationOpen
  return { registrationOpen: demoRegistrationOpen }
})
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

// ---- stats ----
const tally = (labels: string[], limit = 10) => {
  const counts = new Map<string, number>()
  for (const l of labels) if (l) counts.set(l, (counts.get(l) ?? 0) + 1)
  return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, limit)
}
on('GET', '/stats', (): Stats => {
  const s = load()
  const rows = [...s.copies].sort((a, b) => b.addedAt.localeCompare(a.addedAt) || b.id - a.id).map((c) => ({ c, r: release(c.releaseId) }))
  const decades = new Map<number, number>()
  for (const { r } of rows) if (r.year) decades.set(Math.floor(r.year / 10) * 10, (decades.get(Math.floor(r.year / 10) * 10) ?? 0) + 1)
  const today = new Date()
  const months = Array.from({ length: 12 }, (_, i) => {
    const key = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (11 - i), 1)).toISOString().slice(0, 7)
    return { label: key, count: rows.filter(({ c }) => c.addedAt.startsWith(key)).length }
  })
  // Same formula as the demo's marketplace line, so the numbers agree with what the record pages show.
  const perRelease = new Map<number, number>()
  for (const { c } of rows) if (c.releaseId > 0) perRelease.set(c.releaseId, (perRelease.get(c.releaseId) ?? 0) + 1)
  let estimated = 0
  for (const [id, n] of perRelease) estimated += (9 + ((id * 13) % 40)) * n
  const forSale = new Map<string, { total: number; count: number }>()
  for (const { c } of rows) {
    if (!c.forSale) continue
    const cur = c.priceCurrency ?? s.me.currency
    const e = forSale.get(cur) ?? { total: 0, count: 0 }
    if (c.askingPrice != null) e.total += c.askingPrice
    e.count += c.askingPrice != null ? 1 : 0
    forSale.set(cur, e)
  }
  return {
    copies: rows.length,
    releases: new Set(rows.map(({ c }) => c.releaseId)).size,
    wishlist: s.wishlist.length,
    forSale: rows.filter(({ c }) => c.forSale).length,
    byDecade: [...decades].sort((a, b) => a[0] - b[0]).map(([d, count]) => ({ label: `${d}s`, count })),
    byFormat: tally(rows.flatMap(({ r }) => r.format.split(',').map((t) => t.trim()))),
    byGenre: tally(rows.flatMap(({ r }) => r.genres)),
    byCountry: tally(rows.map(({ r }) => r.country ?? '')),
    topArtists: tally(rows.map(({ r }) => r.artist)),
    topLabels: tally(rows.map(({ r }) => r.label ?? '')),
    addedByMonth: months,
    recent: rows.slice(0, 6).map(({ r }) => ({ releaseId: r.id, title: r.title, artist: r.artist, hasCover: r.hasCover })),
    value: { currency: s.me.currency, estimated, pricedReleases: perRelease.size, totalReleases: perRelease.size },
    forSaleValue: [...forSale].map(([currency, v]) => ({ currency, ...v })),
  }
})

// ---- password reset links (the demo has no real accounts, so these only show the flow) ----
on('POST', '/admin/users/:id/reset-link', (m) => {
  if (userById(m[1]).role === 'admin') fail('The admin password is set through the ADMIN_PASSWORD environment variable')
  return { token: 'demo-reset-token', expiresAt: Date.now() + 86_400_000 }
})
on('GET', '/auth/reset/:token', () => ({ name: 'Demo user', email: 'user@example.com' }))
on('POST', '/auth/reset', () => ({ ok: true }))

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
