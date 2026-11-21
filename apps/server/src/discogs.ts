import { config } from './config.js'

const BASE = 'https://api.discogs.com'
const USER_AGENT = 'Cratefolk/0.0.1 +https://github.com/blindpassasjer/cratefolk'

export class DiscogsError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

// Discogs allows 60 requests/min with a token and 25 without. Requests run one at a time,
// spaced out so we stay under that, and 429s are retried after the server's Retry-After.
// Interactive requests (priority 1) jump ahead of background ones (priority 0).
const gapFor = (token: string | null | undefined) => (token || config.discogsToken ? 1100 : 2500)
const queue: Array<{ priority: number; gap: number; run: () => Promise<void> }> = []
let pumping = false
let lastStart = 0

async function pump(): Promise<void> {
  if (pumping) return
  pumping = true
  while (queue.length) {
    let next = 0
    for (let i = 1; i < queue.length; i++) if (queue[i]!.priority > queue[next]!.priority) next = i
    const job = queue.splice(next, 1)[0]!
    const wait = lastStart + job.gap - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastStart = Date.now()
    await job.run()
  }
  pumping = false
}

function schedule<T>(task: () => Promise<T>, priority: number, gap = gapFor(null)): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({ priority, gap, run: () => task().then(resolve, reject) })
    void pump()
  })
}

/** Requests use the server's DISCOGS_TOKEN unless a user's own token is given. */
const headers = (token?: string | null): Record<string, string> => {
  const t = token || config.discogsToken
  return { 'User-Agent': USER_AGENT, ...(t ? { Authorization: `Discogs token=${t}` } : {}) }
}

const TIMEOUT_MS = 20_000

/** A hung or unreachable Discogs must not block the queue, and surfaces as a 502 rather than a crash. */
const fetchDiscogs = (url: URL | string, token?: string | null, init: RequestInit = {}) =>
  fetch(url, {
    ...init,
    headers: { ...headers(token), ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => {
    throw new DiscogsError('Could not reach Discogs', 502)
  })

export interface RequestOptions {
  params?: Record<string, string>
  body?: unknown
  /** A user's own token; defaults to the server's. */
  token?: string | null
  priority?: number
}

/** Calls the Discogs API. Returns undefined for empty (204) responses. */
export async function discogsRequest<T = unknown>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(BASE + path)
  for (const [k, v] of Object.entries(opts.params ?? {})) if (v) url.searchParams.set(k, v)
  const init: RequestInit = { method, ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}) }

  for (let attempt = 0; ; attempt++) {
    const res = await schedule(() => fetchDiscogs(url, opts.token, init), opts.priority ?? 1, gapFor(opts.token))
    if (res.status === 429 && attempt < 3) {
      const retryAfter = Number(res.headers.get('retry-after')) || 5
      await new Promise((r) => setTimeout(r, retryAfter * 1000))
      continue
    }
    if (res.status === 400) throw new DiscogsError('Discogs rejected the request', 400)
    if (res.status === 404) throw new DiscogsError('Not found on Discogs', 404)
    if (res.status === 401) throw new DiscogsError('Discogs rejected the token', 502)
    if (!res.ok) throw new DiscogsError(`Discogs returned ${res.status}`, 502)
    const text = await res.text()
    return (text ? JSON.parse(text) : undefined) as T
  }
}

const getJson = <T>(path: string, params: Record<string, string> = {}, priority = 1) =>
  discogsRequest<T>('GET', path, { params, priority })

/** Checks a user's personal access token and returns the Discogs username it belongs to. */
export async function verifyToken(token: string): Promise<string> {
  const res = await schedule(
    () =>
      fetch(`${BASE}/oauth/identity`, {
        headers: { 'User-Agent': USER_AGENT, Authorization: `Discogs token=${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }).catch(() => {
        throw new DiscogsError('Could not reach Discogs', 502)
      }),
    1,
    gapFor(token),
  )
  if (res.status === 401) throw new DiscogsError('Discogs rejected the token', 401)
  if (!res.ok) throw new DiscogsError(`Discogs returned ${res.status}`, 502)
  return ((await res.json()) as { username: string }).username
}

/** Discogs disambiguates duplicate names with a numeric suffix, e.g. "Nirvana (2)". */
const cleanName = (name: string) => name.replace(/\s\(\d+\)$/, '').trim()

interface SearchResult {
  id: number
  masterId: number | null
  artist: string
  title: string
  year: number | null
  country: string | null
  format: string
  label: string | null
  catno: string | null
  barcode: string | null
  thumb: string | null
}

export interface SearchResponse {
  results: SearchResult[]
  page: number
  pages: number
  items: number
}

interface RawSearch {
  pagination: { page: number; pages: number; items: number }
  results: Array<{
    id: number
    master_id?: number
    title: string
    year?: string
    country?: string
    format?: string[]
    label?: string[]
    catno?: string
    barcode?: string[]
    thumb?: string
  }>
}

export interface SearchParams {
  q?: string
  catno?: string
  barcode?: string
  page?: number
  allFormats?: boolean
}

export async function searchReleases(p: SearchParams): Promise<SearchResponse> {
  const raw = await getJson<RawSearch>('/database/search', {
    type: 'release',
    q: p.q ?? '',
    catno: p.catno ?? '',
    barcode: p.barcode ?? '',
    format: p.allFormats ? '' : 'Vinyl',
    page: String(p.page ?? 1),
    per_page: '25',
  })
  return {
    page: raw.pagination.page,
    pages: raw.pagination.pages,
    items: raw.pagination.items,
    results: raw.results.map((r) => {
      // Search titles look like "Artist - Title"
      const sep = r.title.indexOf(' - ')
      const [artist, title] = sep === -1 ? ['', r.title] : [r.title.slice(0, sep), r.title.slice(sep + 3)]
      return {
        id: r.id,
        masterId: r.master_id || null,
        artist: cleanName(artist),
        title,
        year: r.year ? Number(r.year) || null : null,
        country: r.country ?? null,
        format: (r.format ?? []).join(', '),
        label: r.label?.[0] ? cleanName(r.label[0]) : null,
        catno: r.catno && r.catno !== 'none' ? r.catno : null,
        barcode: r.barcode?.[0] ?? null,
        thumb: r.thumb || null,
      }
    }),
  }
}

interface RawRelease {
  id: number
  master_id?: number
  title: string
  year?: number
  country?: string
  artists?: Array<{ name: string; join?: string }>
  labels?: Array<{ name: string; catno?: string }>
  formats?: Array<{ name: string; qty?: string; descriptions?: string[]; text?: string }>
  genres?: string[]
  styles?: string[]
  tracklist?: Array<{ position: string; type_: string; title: string; duration: string }>
  identifiers?: Array<{ type: string; value: string }>
  images?: Array<{ type: string; uri: string }>
  notes?: string
}

export interface ParsedRelease {
  id: number
  masterId: number | null
  title: string
  artist: string
  year: number | null
  country: string | null
  label: string | null
  catno: string | null
  barcode: string | null
  format: string
  genres: string[]
  styles: string[]
  tracklist: Array<{ position: string; title: string; duration: string }>
  notes: string | null
  coverUrl: string | null
}

function parseRelease(raw: RawRelease): ParsedRelease {
  const artists = raw.artists ?? []
  const artist = artists
    .map((a, i) => {
      const join = a.join?.trim()
      const sep = i === artists.length - 1 || !join ? '' : join === ',' ? ', ' : ` ${join} `
      return cleanName(a.name) + sep
    })
    .join('')

  const format = (raw.formats ?? [])
    .map((f) => {
      const qty = Number(f.qty) > 1 ? `${f.qty}×` : ''
      return [qty + f.name, ...(f.descriptions ?? [])].join(', ')
    })
    .join(' + ')

  const label = raw.labels?.[0]
  const catno = label?.catno && label.catno !== 'none' ? label.catno : null
  const primary = raw.images?.find((i) => i.type === 'primary') ?? raw.images?.[0]

  return {
    id: raw.id,
    masterId: raw.master_id || null,
    title: raw.title,
    artist,
    year: raw.year || null,
    country: raw.country ?? null,
    label: label ? cleanName(label.name) : null,
    catno,
    barcode: raw.identifiers?.find((i) => i.type === 'Barcode')?.value ?? null,
    format,
    genres: raw.genres ?? [],
    styles: raw.styles ?? [],
    tracklist: (raw.tracklist ?? [])
      .filter((t) => t.type_ === 'track' || t.type_ === 'index')
      .map((t) => ({ position: t.position, title: t.title, duration: t.duration })),
    notes: raw.notes?.trim() || null,
    coverUrl: primary?.uri ?? null,
  }
}

export async function fetchRelease(id: number): Promise<ParsedRelease> {
  return parseRelease(await getJson<RawRelease>(`/releases/${id}`))
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024

export async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const { hostname, protocol } = new URL(url)
    if (protocol !== 'https:' || !hostname.endsWith('.discogs.com')) return null
    const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok || !res.headers.get('content-type')?.startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.length <= MAX_IMAGE_BYTES ? buf : null
  } catch {
    return null
  }
}

// Currencies Discogs accepts for marketplace prices.
export const MARKET_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'MXN', 'BRL', 'NZD', 'SEK', 'DKK', 'ZAR'] as const
export type Currency = (typeof MARKET_CURRENCIES)[number]
// What users can pick. NOK isn't a Discogs marketplace currency, so market lookups for it use EUR instead.
export const CURRENCIES = [...MARKET_CURRENCIES, 'NOK'] as const

export const marketCurrency = (currency: string): Currency =>
  (MARKET_CURRENCIES as readonly string[]).includes(currency) ? (currency as Currency) : 'EUR'

export interface MarketStats {
  numForSale: number
  lowestPrice: number | null
}

/** Copies for sale and the lowest asking price. The API has no way to list individual listings. */
export async function fetchMarketStats(releaseId: number, currency: Currency): Promise<MarketStats> {
  const raw = await getJson<{ num_for_sale?: number; lowest_price?: { value: number } | null }>(
    `/marketplace/stats/${releaseId}`,
    { curr_abbr: currency },
    0,
  )
  return { numForSale: raw.num_for_sale ?? 0, lowestPrice: raw.lowest_price?.value ?? null }
}
