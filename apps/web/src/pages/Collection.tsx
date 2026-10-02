import { Archive, Disc3, Pencil, Plus, Settings2, Tag, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AddRecord from '../AddRecord'
import { api, type CollectionGroup, type Copy } from '../api'
import { money } from '../Market'
import CollectionPicker from '../CollectionPicker'
import Cover from '../Cover'
import ManageCollections from '../ManageCollections'
import { useToast } from '../notify'
import SearchBar from '../SearchBar'
import FilterBar from '../FilterBar'
import { filterOptions, matchesFilters, matchesQuery, SORTS, sortItems, type Filters, type SortKey } from '../search'
import ShareExport from '../ShareExport'

export default function Collection() {
  const [params, setParams] = useSearchParams()
  const activeId = Number(params.get('c')) || null
  const sale = params.get('sale') === '1'
  const query = params.get('q') ?? ''
  const sortParam = params.get('sort')
  const sort: SortKey = SORTS.some((s) => s.key === sortParam) ? (sortParam as SortKey) : 'added'
  const filters: Filters = { format: params.get('format') ?? '', decade: params.get('decade') ?? '', country: params.get('country') ?? '' }

  const [copies, setCopies] = useState<Copy[] | null>(null)
  const [groups, setGroups] = useState<CollectionGroup[]>([])
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [saleCount, setSaleCount] = useState(0)
  const [adding, setAdding] = useState(false)
  const [managing, setManaging] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  const active = groups.find((g) => g.id === activeId) ?? null

  const loadGroups = useCallback(async () => {
    setGroups((await api<{ collections: CollectionGroup[] }>('/collections')).collections)
  }, [])

  const latest = useRef(0)

  const load = useCallback(async () => {
    const mine = ++latest.current
    try {
      const qs = activeId ? `?collection=${activeId}` : sale ? '?forSale=1' : ''
      const [{ copies }] = await Promise.all([api<{ copies: Copy[] }>(`/collection${qs}`), loadGroups()])
      // The "All records" and "For sale" chips need the unfiltered totals even while a crate or the sale view is open.
      const everything = activeId || sale ? (await api<{ copies: Copy[] }>('/collection')).copies : copies
      if (mine !== latest.current) return // a newer load started meanwhile; don't overwrite it with older data
      setCopies(copies)
      setTotalCount(everything.length)
      setSaleCount(everything.filter((c) => c.forSale).length)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your collection')
    }
  }, [activeId, sale, loadGroups])

  useEffect(() => {
    void load()
  }, [load])


  // Search text, sort and filters survive switching between collections.
  const withQuery = (p: Record<string, string>) => {
    const keep: Record<string, string> = { ...p }
    for (const k of ['q', 'sort', 'format', 'decade', 'country']) {
      const v = params.get(k)
      if (v) keep[k] = v
    }
    setParams(keep)
  }
  const select = (id: number | null) => withQuery(id ? { c: String(id) } : {})
  const selectSale = () => withQuery({ sale: '1' })
  const setParam = (name: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(name, value)
      else next.delete(name)
      return next
    }, { replace: true })
  const setQuery = (q: string) => setParam('q', q)

  const filtering = !!query || Object.values(filters).some(Boolean)
  const shown = copies ? sortItems(copies.filter((c) => matchesQuery(c, query) && matchesFilters(c, filters)), sort) : null
  const options = filterOptions(copies ?? [])

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  function create(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    void run(async () => {
      const { collection } = await api<{ collection: CollectionGroup }>('/collections', { method: 'POST', json: { name: newName } })
      setNewName('')
      setCreating(false)
      await loadGroups()
      select(collection.id)
      toast.success(`Created the crate “${collection.name}”`)
    })
  }

  const chip = (isActive: boolean) =>
    `shrink-0 rounded-full border px-3 py-1 text-sm transition-colors ${
      isActive ? 'border-wax bg-wax text-on-wax' : 'border-ink-700 text-ink-300 hover:border-ink-500 hover:text-ink-100'
    }`

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
              <button title="Rename" aria-label="Rename" onClick={() => setManaging(true)} className="flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm text-ink-300 hover:text-ink-100">
                <Pencil className="size-4" /> <span className="hidden sm:inline">Rename</span>
              </button>
              <button title="Delete" aria-label="Delete" onClick={() => setManaging(true)} className="flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm text-ink-300 hover:text-danger">
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

      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1">
        <button onClick={() => select(null)} className={chip(!activeId && !sale)}>
          All records{totalCount !== null && <span className="ml-1.5 opacity-70">{totalCount}</span>}
        </button>
        {(saleCount > 0 || sale) && (
          <button onClick={selectSale} className={`${chip(sale)} flex items-center gap-1.5`}>
            <Tag className="size-3.5" /> For sale<span className="opacity-70">{saleCount}</span>
          </button>
        )}
        {groups.map((g) => (
          <button key={g.id} onClick={() => select(g.id)} className={chip(g.id === activeId)}>
            <Archive className="mr-1.5 -mt-0.5 inline size-3.5 opacity-70" />{g.name}
            <span className="ml-1.5 opacity-70">{g.count}</span>
          </button>
        ))}
        {groups.length > 0 && (
          <button onClick={() => setManaging(true)} className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm text-ink-500 hover:text-ink-100">
            <Settings2 className="size-3.5" /> Manage
          </button>
        )}
        {creating ? (
          <form onSubmit={create} className="flex shrink-0 items-center gap-1.5">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setCreating(false)}
              placeholder="Crate name"
              maxLength={60}
              className="w-44 rounded-full border border-ink-700 bg-ink-900 px-3 py-1 text-sm outline-none focus:border-wax"
            />
            <button className="rounded-full bg-wax px-3 py-1 text-sm font-medium text-on-wax hover:bg-wax-hover">Create</button>
          </form>
        ) : (
          <button onClick={() => setCreating(true)} className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-ink-700 px-3 py-1 text-sm text-ink-500 hover:border-wax hover:text-ink-100">
            <Plus className="size-3.5" /> New crate
          </button>
        )}
      </div>

      {(copies?.length ?? 0) > 0 && (
        <div className="space-y-3">
          <SearchBar value={query} onChange={setQuery} placeholder="Search artist, title, label, catalog no. or barcode  ( / )" />
          <FilterBar sort={sort} onSort={(s) => setParam('sort', s === 'added' ? '' : s)} filters={filters} onFilter={setParam} options={options} />
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
          <Disc3 className="size-12 text-ink-700" />
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

      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {shown?.map((c) => (
          <div key={c.copyId} className="group relative">
            <Link to={`/release/${c.releaseId}`} className="block">
              <Cover releaseId={c.releaseId} hasCover={!!c.hasCover} className="rounded-md shadow-lg shadow-black/40 ring-1 ring-ink-800 transition group-hover:-translate-y-0.5 group-hover:ring-wax/60" />
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

      {managing && (
        <ManageCollections
          groups={groups}
          onClose={() => setManaging(false)}
          onChanged={(deletedId) => {
            if (deletedId && deletedId === activeId) {
              setManaging(false)
              select(null)
            } else {
              void load()
            }
          }}
        />
      )}

      {adding && <AddRecord onClose={() => setAdding(false)} onAdded={() => void load()} />}
    </div>
  )
}
