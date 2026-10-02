import { Image, Pencil, Plus, Tag, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AddRecord from '../AddRecord'
import { api, type Copy } from '../api'
import { money } from '../Market'
import CollectionPicker from '../CollectionPicker'
import Cover from '../Cover'
import { useCrates } from '../crates'
import { CrateArt, FormatBadge } from '../Art'
import SearchBar from '../SearchBar'
import FilterBar from '../FilterBar'
import { useProgressive } from '../useProgressive'
import { filterOptions, matchesFilters, matchesQuery, SORTS, sortItems, type Filters, type SortKey } from '../search'
import ShareExport from '../ShareExport'

const SIZE_KEY = 'waxcrate-cover-size'
const SIZE_MIN = 110
const SIZE_MAX = 340
const SIZE_DEFAULT = 190

function loadSize() {
  try {
    const n = Number(localStorage.getItem(SIZE_KEY))
    if (n >= SIZE_MIN && n <= SIZE_MAX) return n
  } catch {
    /* storage unavailable: fall back to the default */
  }
  return SIZE_DEFAULT
}

export default function Collection() {
  const [params, setParams] = useSearchParams()
  const activeId = Number(params.get('c')) || null
  const sale = params.get('sale') === '1'
  const query = params.get('q') ?? ''
  const sortParam = params.get('sort')
  const sort: SortKey = SORTS.some((s) => s.key === sortParam) ? (sortParam as SortKey) : 'added'
  const filters: Filters = { format: params.get('format') ?? '', decade: params.get('decade') ?? '', country: params.get('country') ?? '' }

  const [copies, setCopies] = useState<Copy[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [coverSize, setCoverSize] = useState(loadSize)
  const [error, setError] = useState<string | null>(null)
  const { groups, refresh, manage } = useCrates()

  const active = groups.find((g) => g.id === activeId) ?? null

  const latest = useRef(0)

  const load = useCallback(async () => {
    const mine = ++latest.current
    try {
      const qs = activeId ? `?collection=${activeId}` : sale ? '?forSale=1' : ''
      // The sidebar's crate list and counts are refreshed together with the records.
      const [{ copies }] = await Promise.all([api<{ copies: Copy[] }>(`/collection${qs}`), refresh()])
      if (mine !== latest.current) return // a newer load started meanwhile; don't overwrite it with older data
      setCopies(copies)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your collection')
    }
  }, [activeId, sale, refresh])

  useEffect(() => {
    void load()
  }, [load])

  const setParam = (name: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(name, value)
      else next.delete(name)
      return next
    }, { replace: true })
  const setQuery = (q: string) => setParam('q', q)
  const resize = (n: number) => {
    setCoverSize(n)
    try {
      localStorage.setItem(SIZE_KEY, String(n))
    } catch {
      /* the size just won't persist */
    }
  }

  const filtering = !!query || Object.values(filters).some(Boolean)
  const shown = copies ? sortItems(copies.filter((c) => matchesQuery(c, query) && matchesFilters(c, filters)), sort) : null
  const options = filterOptions(copies ?? [])
  const { visible, hasMore, sentinelRef } = useProgressive(shown, [activeId, sale, query, sort, ...Object.values(filters)].join('|'))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{active ? active.name : sale ? 'For sale' : 'Collection'}</h1>
          {copies && shown && (
            <p className="text-sm text-ink-500">
              {filtering ? `${shown.length} of ${copies.length}` : copies.length} {copies.length === 1 ? 'record' : 'records'}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {active && (
            <>
              <button title="Rename" aria-label="Rename" onClick={manage} className="flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm text-ink-300 hover:text-ink-100">
                <Pencil className="size-4" /> <span className="hidden sm:inline">Rename</span>
              </button>
              <button title="Delete" aria-label="Delete" onClick={manage} className="flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm text-ink-300 hover:text-danger">
                <Trash2 className="size-4" /> <span className="hidden sm:inline">Delete</span>
              </button>
            </>
          )}
          <ShareExport
            key={activeId ?? (sale ? 'sale' : 'all')}
            kind={activeId ? 'group' : sale ? 'forsale' : 'all'}
            collectionId={activeId ?? undefined}
            exportHref={`/api/export/collection.xlsx${activeId ? `?collection=${activeId}` : sale ? '?forSale=1' : ''}`}
          />
          <button onClick={() => setAdding(true)} className="flex items-center gap-2 rounded-md bg-wax px-4 py-2 text-sm font-medium text-on-wax hover:bg-wax-hover">
            <Plus className="size-4" /> Add record
          </button>
        </div>
      </div>

      {(copies?.length ?? 0) > 0 && (
        <div className="space-y-3">
          <SearchBar value={query} onChange={setQuery} placeholder="Search artist, title, label, catalog no. or barcode  ( / )" />
          <FilterBar sort={sort} onSort={(s) => setParam('sort', s === 'added' ? '' : s)} filters={filters} onFilter={setParam} options={options}>
            <label className="flex items-center gap-2 text-sm text-ink-500" title="Cover size">
              <Image className="size-4" aria-hidden="true" />
              <input
                type="range"
                aria-label="Cover size"
                min={SIZE_MIN}
                max={SIZE_MAX}
                step={10}
                value={coverSize}
                onChange={(e) => resize(Number(e.target.value))}
                onDoubleClick={() => resize(SIZE_DEFAULT)}
                className="w-28 accent-wax"
              />
            </label>
          </FilterBar>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {copies && copies.length > 0 && shown?.length === 0 && (
        <p className="py-16 text-center text-sm text-ink-500">
          No records match{query && <> “{query}”</>}.{' '}
          <button
            onClick={() => setParams((prev) => { const next = new URLSearchParams(prev); ['q', 'format', 'decade', 'country'].forEach((k) => next.delete(k)); return next }, { replace: true })}
            className="text-wax hover:underline"
          >
            Clear search and filters
          </button>
        </p>
      )}

      {copies?.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <CrateArt />
          <h2 className="text-xl font-semibold">{active ? 'This crate is empty' : 'Your collection is empty'}</h2>
          <p className="max-w-sm text-sm text-ink-500">
            {active
              ? 'Use the folder icon on any record in All records to add it here.'
              : sale
                ? 'Open a record and tick “For sale” on one of your copies.'
                : 'Search Discogs by name, catalog number or barcode to add your first record.'}
          </p>
        </div>
      )}

      <div className="grid gap-5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${coverSize}px, 100%), 1fr))` }}>
        {visible?.map((c) => (
          <div key={c.copyId} className="group relative">
            <Link to={`/release/${c.releaseId}`} className="block">
              <Cover releaseId={c.releaseId} hasCover={!!c.hasCover} badge={<FormatBadge format={c.format} />} className="rounded-md shadow-lg shadow-black/40 ring-1 ring-ink-800 transition group-hover:-translate-y-0.5 group-hover:ring-wax/60" />
              <div className="mt-2 truncate text-sm font-medium">{c.title}</div>
              <div className="truncate text-xs text-ink-500">{[c.artist, c.year].filter(Boolean).join(' · ')}</div>
            </Link>
            {!!c.forSale && (
              <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-xs text-white">
                <Tag className="size-3" />
                {c.askingPrice != null && c.priceCurrency ? money(c.askingPrice, c.priceCurrency) : 'For sale'}
              </span>
            )}
            <div className="absolute right-2 top-2">
              <CollectionPicker copyId={c.copyId} selected={c.collectionIds} groups={groups} onChanged={() => void load()} />
            </div>
          </div>
        ))}
      </div>
      {hasMore && <div ref={sentinelRef} className="h-10" />}

      {adding && <AddRecord onClose={() => setAdding(false)} onAdded={() => void load()} />}
    </div>
  )
}
