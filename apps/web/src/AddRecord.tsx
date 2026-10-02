import { Check, Disc3, Heart, Loader2, Search, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, type SearchResponse, type SearchResult, type Status } from './api'
import { useToast } from './notify'

type Mode = 'q' | 'catno' | 'barcode'
const MODES: Array<{ id: Mode; label: string; placeholder: string }> = [
  { id: 'q', label: 'Search', placeholder: 'Artist, album, label…' },
  { id: 'catno', label: 'Catalog #', placeholder: 'e.g. PB 41447' },
  { id: 'barcode', label: 'Barcode', placeholder: 'e.g. 5012394144777' },
]

export default function AddRecord({
  onClose,
  onAdded,
  defaultTarget = 'collection',
}: {
  onClose: () => void
  onAdded: () => void
  defaultTarget?: 'collection' | 'wishlist'
}) {
  const [mode, setMode] = useState<Mode>('q')
  const [term, setTerm] = useState('')
  const [allFormats, setAllFormats] = useState(false)
  const [data, setData] = useState<SearchResponse | null>(null)
  const [searched, setSearched] = useState<{ mode: Mode; term: string; allFormats: boolean } | null>(null)
  const [loading, setLoading] = useState(false)
  const toast = useToast()
  const [adding, setAdding] = useState<number | null>(null)
  const [status, setStatus] = useState<Status>({ owned: {}, wishlisted: [] })
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function run(params: { mode: Mode; term: string; allFormats: boolean }, page: number) {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ [params.mode]: params.term, page: String(page) })
      if (params.allFormats) qs.set('allFormats', '1')
      const res = await api<SearchResponse>(`/discogs/search?${qs}`)
      setStatus(await api<Status>(`/status?ids=${res.results.map((r) => r.id).join(',')}`))
      setData(res)
      setSearched(params)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (term.trim()) void run({ mode, term: term.trim(), allFormats }, 1)
  }

  async function add(r: SearchResult, target: 'collection' | 'wishlist') {
    setAdding(r.id)
    try {
      await api(`/${target}`, { method: 'POST', json: { releaseId: r.id } })
      setStatus((s) =>
        target === 'collection'
          ? { owned: { ...s.owned, [r.id]: (s.owned[r.id] ?? 0) + 1 }, wishlisted: s.wishlisted.filter((id) => id !== r.id) }
          : { ...s, wishlisted: [...s.wishlisted, r.id] },
      )
      toast.success(target === 'collection' ? `Added “${r.title}” to your collection` : `Added “${r.title}” to your wishlist`)
      onAdded()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add record')
    } finally {
      setAdding(null)
    }
  }

  const current = MODES.find((m) => m.id === mode)!

  return (
    <div className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:pt-[8vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-2xl rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-800 px-4 py-3">
          <h2 className="font-semibold">{defaultTarget === 'wishlist' ? 'Find a record to wishlist' : 'Add a record from Discogs'}</h2>
          <button onClick={onClose} aria-label="Close" className="text-ink-500 hover:text-ink-100">
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3 border-b border-ink-800 p-4">
          <div className="flex gap-1">
            {MODES.map((m) => (
              <button
                type="button"
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`rounded-md px-3 py-1 text-sm ${mode === m.id ? 'bg-ink-700 text-ink-100' : 'text-ink-300 hover:text-ink-100'}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={current.placeholder}
              className="min-w-0 flex-1 rounded-md border border-ink-700 bg-ink-950 px-3 py-2 text-sm outline-none focus:border-wax"
            />
            <button className="flex items-center gap-2 rounded-md bg-wax px-4 py-2 text-sm font-medium text-on-wax hover:bg-wax-hover">
              <Search className="size-4" /> Search
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-500">
            <input type="checkbox" checked={allFormats} onChange={(e) => setAllFormats(e.target.checked)} className="accent-wax" />
            Include non-vinyl formats (CD, cassette…)
          </label>
        </form>

        <div className="p-2">
          {loading && (
            <div className="flex justify-center py-10 text-ink-500">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )}
          {!loading && data && data.results.length === 0 && <p className="px-2 py-8 text-center text-sm text-ink-500">No releases found.</p>}
          {!loading && (
            <ul>
              {data?.results.map((r) => (
                <li key={r.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-ink-800/60">
                  {r.thumb ? (
                    <img src={r.thumb} alt="" referrerPolicy="no-referrer" className="size-14 shrink-0 rounded bg-ink-800 object-cover" />
                  ) : (
                    <div className="flex size-14 shrink-0 items-center justify-center rounded bg-ink-800">
                      <Disc3 className="size-6 text-ink-700" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="truncate font-medium">
                      {r.artist && <span className="text-ink-300">{r.artist} — </span>}
                      {r.title}
                    </div>
                    <div className="truncate text-xs text-ink-500">
                      {[r.year, r.country, r.format].filter(Boolean).join(' · ')}
                    </div>
                    <div className="truncate text-xs text-ink-500">{[r.label, r.catno, r.barcode].filter(Boolean).join(' · ')}</div>
                  </div>
                  {defaultTarget === 'wishlist' ? (
                    // Opened from the Wishlist page: the only action here is wishlisting.
                    <div className="shrink-0">
                      {status.owned[r.id] ? (
                        <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-ink-500">
                          <Check className="size-3.5" /> You own this
                        </span>
                      ) : (
                        <button
                          onClick={() => void add(r, 'wishlist')}
                          disabled={adding === r.id || status.wishlisted.includes(r.id)}
                          className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs disabled:opacity-100 ${status.wishlisted.includes(r.id) ? 'border-wax text-wax' : 'border-ink-700 hover:border-wax'}`}
                        >
                          {adding === r.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Heart className={`size-3.5 ${status.wishlisted.includes(r.id) ? 'fill-current' : ''}`} />
                          )}
                          {status.wishlisted.includes(r.id) ? 'On wishlist' : 'Add to wishlist'}
                        </button>
                      )}
                    </div>
                  ) : (
                  <div className="flex shrink-0 items-center gap-2">
                    {!status.owned[r.id] && (
                      <button
                        onClick={() => void add(r, 'wishlist')}
                        disabled={adding === r.id || status.wishlisted.includes(r.id)}
                        aria-label="Add to wishlist"
                        title={status.wishlisted.includes(r.id) ? 'On your wishlist' : 'Add to wishlist'}
                        className={`rounded-md border p-1.5 ${status.wishlisted.includes(r.id) ? 'border-wax text-wax' : 'border-ink-700 text-ink-500 hover:border-wax hover:text-wax'}`}
                      >
                        <Heart className={`size-4 ${status.wishlisted.includes(r.id) ? 'fill-current' : ''}`} />
                      </button>
                    )}
                    <button
                      onClick={() => void add(r, 'collection')}
                      disabled={adding === r.id}
                      className="flex items-center gap-1.5 rounded-md border border-ink-700 px-3 py-1.5 text-xs hover:border-wax disabled:opacity-60"
                    >
                      {adding === r.id ? <Loader2 className="size-3.5 animate-spin" /> : status.owned[r.id] ? <Check className="size-3.5 text-wax" /> : null}
                      {status.owned[r.id] ? `Owned${status.owned[r.id]! > 1 ? ` ×${status.owned[r.id]}` : ''} · add another` : 'Add'}
                    </button>
                  </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {data && searched && data.pages > 1 && (
            <div className="flex items-center justify-between px-2 py-3 text-xs text-ink-500">
              <button disabled={loading || data.page <= 1} onClick={() => void run(searched, data.page - 1)} className="hover:text-ink-100 disabled:opacity-40">
                ← Previous
              </button>
              <span>
                Page {data.page} of {data.pages} · {data.items.toLocaleString()} results
              </span>
              <button disabled={loading || data.page >= data.pages} onClick={() => void run(searched, data.page + 1)} className="hover:text-ink-100 disabled:opacity-40">
                Next →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
