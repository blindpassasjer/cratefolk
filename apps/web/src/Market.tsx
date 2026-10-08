import { ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from './api'
import { useAuth } from './auth'

interface MarketData {
  numForSale: number
  lowestPrice: number | null
  currency: string
  url: string
  stale?: boolean
}

export const money = (value: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value)

export interface Shop {
  id: string
  name: string
  region: 'Global' | 'Nordic' | 'Europe' | 'UK & US'
  url: (q: string) => string
}

/** Shops that can be searched for a release. Search deep links only (no API, so no prices); `q` is URL-encoded. */
export const SHOPS: Shop[] = [
  { id: 'ebay', name: 'eBay', region: 'Global', url: (q) => `https://www.ebay.com/sch/i.html?_nkw=${q}` },
  { id: 'bandcamp', name: 'Bandcamp', region: 'Global', url: (q) => `https://bandcamp.com/search?q=${q}` },
  { id: 'amazon', name: 'Amazon', region: 'Global', url: (q) => `https://www.amazon.com/s?k=${q}&i=popular` },
  { id: 'vinylpladen', name: 'Vinylpladen', region: 'Nordic', url: (q) => `https://vinylpladen.no/soek?q=${q}` },
  { id: 'platekompaniet', name: 'Platekompaniet', region: 'Nordic', url: (q) => `https://www.platekompaniet.no/search?q=${q}` },
  { id: 'finn', name: 'FINN.no', region: 'Nordic', url: (q) => `https://www.finn.no/recommerce/forsale/search?q=${q}` },
  { id: 'tradera', name: 'Tradera', region: 'Nordic', url: (q) => `https://www.tradera.com/search?q=${q}` },
  { id: 'cdon', name: 'CDON', region: 'Nordic', url: (q) => `https://cdon.no/sok?q=${q}` },
  { id: 'hhv', name: 'HHV', region: 'Europe', url: (q) => `https://www.hhv.de/shop/en/search?q=${q}` },
  { id: 'deejay', name: 'Deejay.de', region: 'Europe', url: (q) => `https://www.deejay.de/${q}` },
  { id: 'recordshopx', name: 'Record Shop X', region: 'Europe', url: (q) => `https://recordshopx.com/search?q=${q}` },
  { id: 'juno', name: 'Juno Records', region: 'UK & US', url: (q) => `https://www.juno.co.uk/search/?q%5Ball%5D%5B%5D=${q}` },
  { id: 'roughtrade', name: 'Rough Trade', region: 'UK & US', url: (q) => `https://www.roughtrade.com/en-gb/search?q=${q}` },
  { id: 'norman', name: 'Norman Records', region: 'UK & US', url: (q) => `https://www.normanrecords.com/search?q=${q}` },
  { id: 'boomkat', name: 'Boomkat', region: 'UK & US', url: (q) => `https://boomkat.com/products?q%5Bkeywords%5D=${q}` },
  { id: 'amoeba', name: 'Amoeba', region: 'UK & US', url: (q) => `https://www.amoeba.com/search/?q=${q}` },
]

export const DEFAULT_SHOPS = 'ebay,bandcamp'
export const parseShops = (value: string | undefined) => (value ?? DEFAULT_SHOPS).split(',').filter(Boolean)

/** Deep links that search the user's chosen shops for the release. */
function OtherShops({ query }: { query: string }) {
  const { user } = useAuth()
  const q = encodeURIComponent(query)
  const chosen = parseShops(user?.shops)
  const shops = SHOPS.filter((s) => chosen.includes(s.id))
  if (!shops.length) return null
  return (
    <div className="text-xs text-ink-500">
      Also search:{' '}
      {shops.map((shop, i) => (
        <span key={shop.id}>
          {i > 0 && ' · '}
          <a href={shop.url(q)} target="_blank" rel="noreferrer" className="hover:text-wax hover:underline">
            {shop.name}
          </a>
        </span>
      ))}
    </div>
  )
}

// The server feeds uncached lookups through a rate-limited Discogs queue (1-2.5s each). Firing one per card
// at once would hold every browser connection open and starve the page's own requests, so run a few at a time.
const MAX_CONCURRENT = 2
const waiting: Array<() => void> = []
let running = 0

function pump() {
  while (running < MAX_CONCURRENT && waiting.length) waiting.shift()!()
}

function limited<T>(task: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException('Aborted', 'AbortError'))
    if (signal.aborted) return abort()
    signal.addEventListener('abort', abort, { once: true })
    waiting.push(() => {
      if (signal.aborted) return // cancelled while queued: never hits the network
      running++
      task()
        .then(resolve, reject)
        .finally(() => {
          running--
          pump()
        })
    })
    pump()
  })
}

/** Discogs marketplace summary for a release: copies for sale, lowest price, and a link to the listings. */
export default function Market({ releaseId, currency, search }: { releaseId: number; currency: string; search?: string }) {
  const [data, setData] = useState<MarketData | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const ctrl = new AbortController()
    setData(null)
    setFailed(false)
    limited(() => api<MarketData>(`/market/${releaseId}`, { signal: ctrl.signal }), ctrl.signal)
      .then((d) => !ctrl.signal.aborted && setData(d))
      .catch(() => !ctrl.signal.aborted && setFailed(true))
    return () => ctrl.abort()
  }, [releaseId, currency])

  const url = data?.url ?? `https://www.discogs.com/sell/release/${releaseId}`
  const link = (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-wax hover:underline">
      {data?.numForSale ? 'View listings' : 'Discogs'} <ExternalLink className="size-3" />
    </a>
  )

  if (failed)
    return (
      <div className="space-y-0.5">
        <div className="text-xs text-ink-500">Prices unavailable · {link}</div>
        {search && <OtherShops query={search} />}
      </div>
    )
  if (!data) return <div className="h-4 w-2/3 animate-pulse rounded bg-ink-800" />

  return data.numForSale > 0 && data.lowestPrice !== null ? (
    <div className="space-y-0.5 text-xs">
      <div>
        <span className="font-medium text-ink-100">from {money(data.lowestPrice, data.currency)}</span>
        <span className="text-ink-500"> · {data.numForSale} for sale</span>
      </div>
      {link}
      {search && <OtherShops query={search} />}
    </div>
  ) : (
    <div className="space-y-0.5 text-xs text-ink-500">
      <div>None for sale right now</div>
      {link}
      {search && <OtherShops query={search} />}
    </div>
  )
}
