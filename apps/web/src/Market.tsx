import { ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from './api'

interface MarketData {
  numForSale: number
  lowestPrice: number | null
  currency: string
  url: string
  stale?: boolean
}

export const money = (value: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value)

/** Discogs marketplace summary for a release: copies for sale, lowest price, and a link to the listings. */
export default function Market({ releaseId, currency }: { releaseId: number; currency: string }) {
  const [data, setData] = useState<MarketData | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setFailed(false)
    api<MarketData>(`/market/${releaseId}`)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [releaseId, currency])

  const url = data?.url ?? `https://www.discogs.com/sell/release/${releaseId}`
  const link = (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-wax hover:underline">
      {data?.numForSale ? 'View listings' : 'Discogs'} <ExternalLink className="size-3" />
    </a>
  )

  if (failed) return <div className="text-xs text-ink-500">Prices unavailable · {link}</div>
  if (!data) return <div className="h-4 w-2/3 animate-pulse rounded bg-ink-800" />

  return data.numForSale > 0 && data.lowestPrice !== null ? (
    <div className="space-y-0.5 text-xs">
      <div>
        <span className="font-medium text-ink-100">from {money(data.lowestPrice, data.currency)}</span>
        <span className="text-ink-500"> · {data.numForSale} for sale</span>
      </div>
      {link}
    </div>
  ) : (
    <div className="space-y-0.5 text-xs text-ink-500">
      <div>None for sale right now</div>
      {link}
    </div>
  )
}
