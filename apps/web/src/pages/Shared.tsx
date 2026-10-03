import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { api, ApiError, IS_DEMO } from '../api'
import Cover from '../Cover'
import { CoverSizeSlider, useCoverSize } from '../CoverSize'
import FilterBar from '../FilterBar'
import SearchBar from '../SearchBar'
import { filterOptions, matchesFilters, matchesQuery, SORTS, sortItems, type Filters, type SortKey } from '../search'
import { useProgressive } from '../useProgressive'
import { money } from '../Market'
import { Logo } from '../Logo'
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
  const cover = useCoverSize()
  const [data, setData] = useState<SharedView | null>(null)
  const [gone, setGone] = useState(false)
  const [failed, setFailed] = useState(false)
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const filters: Filters = { format: params.get('format') ?? '', decade: params.get('decade') ?? '', country: params.get('country') ?? '' }
  const setParam = (name: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(name, value)
      else next.delete(name)
      return next
    }, { replace: true })
  // Shared lists have no "added" date, and only the for-sale list has prices. They arrive sorted by artist.
  const sorts = SORTS.filter((s) => s.key !== 'added' && (s.key !== 'price' || data?.kind === 'forsale'))
  const sortParam = params.get('sort')
  const sort: SortKey = sorts.some((s) => s.key === sortParam) ? (sortParam as SortKey) : 'artist'
  const filtering = !!query || Object.values(filters).some(Boolean)
  const shown = data ? sortItems(data.items.filter((i) => matchesQuery(i, query) && matchesFilters(i, filters)), sort) : null
  const { visible, hasMore, sentinelRef } = useProgressive(shown, [token, query, sort, ...Object.values(filters)].join('|'))

  useEffect(() => {
    api<SharedView>(`/shared/${token}`)
      .then(setData)
      .catch((e) => (e instanceof ApiError && e.status === 404 ? setGone(true) : setFailed(true)))
  }, [token])

  useEffect(() => {
    if (data) document.title = `${data.title} · ${data.owner} · Cratelog`
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
        {failed && (
          <div className="py-24 text-center">
            <h1 className="text-xl font-semibold">Could not load this link</h1>
            <p className="mt-2 text-sm text-ink-500">Check your connection and reload the page.</p>
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
                {filtering && shown ? `${shown.length} of ${data.items.length}` : data.items.length} {data.items.length === 1 ? 'record' : 'records'}
              </p>
            </div>
            {data.items.length > 8 && (
              <div className="space-y-3">
                <SearchBar value={query} onChange={(q) => setParam('q', q)} placeholder="Search artist, title, label or catalog no.  ( / )" />
                <FilterBar sort={sort} onSort={(s) => setParam('sort', s === 'artist' ? '' : s)} filters={filters} onFilter={setParam} options={filterOptions(data.items)} sorts={sorts}>
<CoverSizeSlider size={cover.size} onChange={cover.resize} />
</FilterBar>
              </div>
            )}
            {shown?.length === 0 && (
              <p className="py-16 text-center text-sm text-ink-500">
                No records match.{' '}
                <button onClick={() => setParams({}, { replace: true })} className="text-wax hover:underline">
                  Clear search and filters
                </button>
              </p>
            )}
            <div className="grid gap-5" style={cover.gridStyle}>
              {visible?.map((i) => (
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
            {hasMore && <div ref={sentinelRef} className="h-10" />}
          </div>
        )}
      </main>
    </div>
  )
}
