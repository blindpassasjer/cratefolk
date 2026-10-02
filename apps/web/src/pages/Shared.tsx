import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, ApiError, IS_DEMO } from '../api'
import Cover from '../Cover'
import { money } from '../Market'
import { Logo } from '../Layout'
import { ThemeToggle } from '../theme'

interface SharedItem {
  releaseId: number
  title: string
  artist: string
  year: number | null
  country: string | null
  label: string | null
  catno: string | null
  format: string
  hasCover: number
  copies: number
  copyId?: number
  mediaCondition?: string | null
  sleeveCondition?: string | null
  askingPrice?: number | null
  priceCurrency?: string | null
}

interface SharedView {
  title: string
  owner: string
  kind: 'all' | 'group' | 'wishlist' | 'forsale'
  items: SharedItem[]
}

export default function Shared() {
  const { token } = useParams()
  const [data, setData] = useState<SharedView | null>(null)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    api<SharedView>(`/shared/${token}`)
      .then(setData)
      .catch((e) => e instanceof ApiError && e.status === 404 ? setGone(true) : console.error(e))
  }, [token])

  useEffect(() => {
    if (data) document.title = `${data.title} · ${data.owner} · WaxCrate`
  }, [data])

  return (
    <div className="min-h-screen">
      <header className="border-b border-ink-800">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Logo />
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">
        {gone && (
          <div className="py-24 text-center">
            <h1 className="text-xl font-semibold">This link is no longer available</h1>
            <p className="mt-2 text-sm text-ink-500">The owner may have stopped sharing it.</p>
          </div>
        )}
        {data && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {data.kind === 'group'
                  ? data.title
                  : data.kind === 'wishlist'
                    ? `${data.owner}'s wishlist`
                    : data.kind === 'forsale'
                      ? `Records for sale by ${data.owner}`
                      : `${data.owner}'s collection`}
              </h1>
              <p className="text-sm text-ink-500">
                {data.kind === 'group' && `A crate by ${data.owner} · `}
                {data.items.length} {data.items.length === 1 ? 'record' : 'records'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {data.items.map((i) => (
                <a
                  key={i.copyId ?? i.releaseId}
                  // Records added by hand (negative IDs) have no Discogs page
                  href={i.releaseId < 0 ? undefined : IS_DEMO ? `https://www.discogs.com/search/?type=release&q=${encodeURIComponent(`${i.artist} ${i.title}`)}` : `https://www.discogs.com/release/${i.releaseId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="group relative block"
                >
                  <Cover
                    releaseId={i.releaseId}
                    hasCover={!!i.hasCover}
                    src={`/api/shared/${token}/cover/${i.releaseId}`}
                    className="rounded-md shadow-lg shadow-black/40 ring-1 ring-ink-800 transition group-hover:-translate-y-0.5 group-hover:ring-wax/60"
                  />
                  {i.copies > 1 && <span className="absolute right-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-xs text-white">×{i.copies}</span>}
                  <div className="mt-2 truncate text-sm font-medium">{i.title}</div>
                  <div className="truncate text-xs text-ink-500">{[i.artist, i.year].filter(Boolean).join(' · ')}</div>
                  <div className="truncate text-xs text-ink-500">{[i.label, i.catno].filter(Boolean).join(' · ')}</div>
                  {data.kind === 'forsale' && (
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-ink-500">
                        {[i.mediaCondition && `Media ${i.mediaCondition}`, i.sleeveCondition && `Sleeve ${i.sleeveCondition}`].filter(Boolean).join(' · ')}
                      </span>
                      <span className="shrink-0 font-medium text-wax">
                        {i.askingPrice != null && i.priceCurrency ? money(i.askingPrice, i.priceCurrency) : 'Ask for price'}
                      </span>
                    </div>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
