import { ArrowLeft, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import Cover from '../Cover'
import { CoverSizeSlider, useCoverSize } from '../CoverSize'
import FilterBar from '../FilterBar'
import SearchBar from '../SearchBar'
import { filterOptions, matchesFilters, matchesQuery, SORTS, sortItems, type Filters, type SortKey } from '../search'
import { useProgressive } from '../useProgressive'

interface Item {
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
  shared?: number
}

interface FriendView {
  name: string
  collection: Item[] | null
  wishlist: Item[] | null
}

export default function Friend() {
  const { id } = useParams()
  const location = useLocation()
  const cover = useCoverSize()
  const [data, setData] = useState<FriendView | null>(null)
  const [error, setError] = useState<string | null>(null)
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
  // The lists have no "added" date or prices, and arrive sorted by artist.
  const sorts = SORTS.filter((s) => s.key !== 'added' && s.key !== 'price')
  const sortParam = params.get('sort')
  const sort: SortKey = sorts.some((s) => s.key === sortParam) ? (sortParam as SortKey) : 'artist'

  const tab = params.get('tab') === 'wishlist' && data?.wishlist ? 'wishlist' : data?.collection ? 'collection' : 'wishlist'
  const items = data?.[tab] ?? null
  const filtering = !!query || Object.values(filters).some(Boolean)
  const shown = items ? sortItems(items.filter((i) => matchesQuery(i, query) && matchesFilters(i, filters)), sort) : null
  const { visible, hasMore, sentinelRef } = useProgressive(shown, [id, tab, query, sort, ...Object.values(filters)].join('|'))

  useEffect(() => {
    api<FriendView>(`/friends/${id}`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError && e.status === 404 ? 'This friend is not sharing their collection.' : 'Could not load this friend.'))
  }, [id])

  if (error) return <p className="text-sm text-ink-500">{error}</p>
  if (!data || !items) return null

  return (
    <div className="space-y-6">
      <Link to="/friends" className="inline-flex items-center gap-1.5 text-sm text-ink-300 hover:text-ink-100">
        <ArrowLeft className="size-4" /> Friends
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{data.name}&apos;s {tab}</h1>
          <p className="text-sm text-ink-500">
            {filtering && shown ? `${shown.length} of ${items.length}` : items.length} {items.length === 1 ? 'record' : 'records'}
          </p>
        </div>
        {data.collection && data.wishlist && (
          <div className="flex gap-1">
            {(['collection', 'wishlist'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setParam('tab', t === 'collection' ? '' : t)}
                className={`rounded-md px-3 py-1 text-sm capitalize ${tab === t ? 'bg-ink-700 text-ink-100' : 'text-ink-300 hover:text-ink-100'}`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {items.length > 8 && (
        <div className="space-y-3">
          <SearchBar value={query} onChange={(q) => setParam('q', q)} placeholder="Search artist, title, label, track or catalog no.  ( / )" />
          <FilterBar sort={sort} onSort={(s) => setParam('sort', s === 'artist' ? '' : s)} filters={filters} onFilter={setParam} options={filterOptions(items)} sorts={sorts}>
<CoverSizeSlider size={cover.size} onChange={cover.resize} />
</FilterBar>
        </div>
      )}
      {shown?.length === 0 && <p className="py-16 text-center text-sm text-ink-500">No records match.</p>}

      <div className="grid gap-5" style={cover.gridStyle}>
        {visible?.map((i) => {
          const tile = (
            <>
              <Cover
                releaseId={i.releaseId}
                hasCover={!!i.hasCover}
                src={`/api/friends/${id}/cover/${i.releaseId}`}
                className="rounded-md shadow-sm shadow-black/40 ring-1 ring-ink-800 transition group-hover:-translate-y-0.5 group-hover:ring-wax/60"
              />
              {i.copies > 1 && <span className="absolute right-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-xs text-white">×{i.copies}</span>}
              {!!i.shared && (
                <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-xs text-white">
                  <Users className="size-3" /> Shared
                </span>
              )}
              <div className="mt-2 truncate text-sm font-medium">{i.title}</div>
              <div className="truncate text-xs text-ink-500">{[i.artist, i.year].filter(Boolean).join(' · ')}</div>
              <div className="truncate text-xs text-ink-500">{[i.label, i.catno].filter(Boolean).join(' · ')}</div>
            </>
          )
          // Records someone added by hand are private to their creator, so there is no page to open for them.
          return i.releaseId < 0 ? (
            <div key={i.releaseId} className="group relative">{tile}</div>
          ) : (
            <Link key={i.releaseId} to={`/release/${i.releaseId}`} state={{ back: { to: location.pathname + location.search, label: `${data.name}'s ${tab}` } }} className="group relative block">{tile}</Link>
          )
        })}
      </div>
      {hasMore && <div ref={sentinelRef} className="h-10" />}
    </div>
  )
}
