import { Heart } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AddRecord from '../AddRecord'
import { api, CURRENCIES, type WishItem } from '../api'
import { useAuth } from '../auth'
import Market from '../Market'
import SearchBar from '../SearchBar'
import { matchesQuery } from '../search'
import ShareExport from '../ShareExport'
import Cover from '../Cover'

export default function Wishlist() {
  const { user, setCurrency } = useAuth()
  const [items, setItems] = useState<WishItem[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const setQuery = (q: string) => setParams(q ? { q } : {}, { replace: true })
  const shown = items?.filter((w) => matchesQuery(w, query)) ?? null

  const load = useCallback(async () => {
    try {
      setItems((await api<{ items: WishItem[] }>('/wishlist')).items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your wishlist')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Wishlist</h1>
          {items && shown && (
            <p className="text-sm text-ink-500">
              {query ? `${shown.length} of ${items.length}` : items.length} {items.length === 1 ? 'record' : 'records'} you're after
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-ink-500">
            Prices in
            <select
              value={user?.currency ?? 'USD'}
              onChange={(e) => void setCurrency(e.target.value)}
              className="rounded-md border border-ink-700 bg-ink-900 px-2 py-1.5 text-sm text-ink-100 outline-none focus:border-wax"
            >
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <ShareExport kind="wishlist" exportHref="/api/export/wishlist.xlsx" />
          <button onClick={() => setAdding(true)} className="flex items-center gap-2 rounded-md bg-wax px-4 py-2 text-sm font-medium text-on-wax hover:bg-wax-hover">
            <Heart className="size-4" /> Find a record
          </button>
        </div>
      </div>

      {items && items.length > 0 && (
        <SearchBar value={query} onChange={setQuery} placeholder="Search artist, title, label, catalog no. or barcode  ( / )" />
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {items && items.length > 0 && shown?.length === 0 && (
        <p className="py-16 text-center text-sm text-ink-500">
          No records match “{query}”. <button onClick={() => setQuery('')} className="text-wax hover:underline">Clear search</button>
        </p>
      )}

      {items?.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <Heart className="size-12 text-ink-700" />
          <h2 className="text-xl font-semibold">Nothing on your wishlist yet</h2>
          <p className="max-w-sm text-sm text-ink-500">Search Discogs and tap the heart on the exact pressing you want.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {shown?.map((w) => (
          <div key={w.wishId} className="group">
            <Link to={`/release/${w.releaseId}`} className="block">
              <Cover releaseId={w.releaseId} hasCover={!!w.hasCover} className="rounded-md shadow-lg shadow-black/40 ring-1 ring-ink-800 transition group-hover:ring-wax/60" />
              <div className="mt-2 truncate text-sm font-medium">{w.title}</div>
              <div className="truncate text-xs text-ink-500">{[w.artist, w.year].filter(Boolean).join(' · ')}</div>
              <div className="truncate text-xs text-ink-500">{[w.country, w.label, w.catno].filter(Boolean).join(' · ')}</div>
            </Link>
            <div className="mt-2">
              <Market releaseId={w.releaseId} currency={user?.currency ?? 'USD'} search={`${w.artist} ${w.title}`} />
            </div>
          </div>
        ))}
      </div>

      {adding && <AddRecord defaultTarget="wishlist" onClose={() => setAdding(false)} onAdded={() => void load()} />}
    </div>
  )
}
