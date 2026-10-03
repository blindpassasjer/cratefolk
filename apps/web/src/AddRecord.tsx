import { Check, Disc3, Heart, Loader2, ScanBarcode, Search, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, IS_DEMO, type SearchResponse, type SearchResult, type Status } from './api'
import BarcodeScanner, { canScan } from './BarcodeScanner'
import ManualRecord from './ManualRecord'
import { useDialog, useToast } from './notify'

type Mode = 'q' | 'catno' | 'barcode'

// One search box: a run of 8-14 digits is a barcode, anything else is free text, which Discogs also matches
// against catalog numbers. If free text finds nothing we retry it as an exact catalog number.
const BARCODE = /^\d{8,14}$/
const modeFor = (term: string): Mode => (BARCODE.test(term.replace(/[\s-]/g, '')) ? 'barcode' : 'q')

export default function AddRecord({
  onClose,
  onAdded,
  defaultTarget = 'collection',
}: {
  onClose: () => void
  onAdded: () => void
  defaultTarget?: 'collection' | 'wishlist'
}) {
  const [manual, setManual] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [term, setTerm] = useState('')
  const [allFormats, setAllFormats] = useState(false)
  const [data, setData] = useState<SearchResponse | null>(null)
  const [searched, setSearched] = useState<{ mode: Mode; term: string; allFormats: boolean } | null>(null)
  const [loading, setLoading] = useState(false)
  const toast = useToast()
  const { confirm } = useDialog()
  const [adding, setAdding] = useState<number | null>(null)
  const [status, setStatus] = useState<Status>({ owned: {}, wishlisted: [] })
  const inputRef = useRef<HTMLInputElement>(null)
  const latest = useRef(0)

  useEffect(() => {
    inputRef.current?.focus()
    // A confirm dialog on top handles its own Escape; don't close the whole search with it.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[aria-modal="true"]') && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function run(params: { mode: Mode; term: string; allFormats: boolean }, page: number) {
    const mine = ++latest.current
    setLoading(true)
    try {
      const fetchPage = (mode: Mode, term: string) => {
        const qs = new URLSearchParams({ [mode]: term, page: String(page) })
        if (params.allFormats) qs.set('allFormats', '1')
        return api<SearchResponse>(`/discogs/search?${qs}`)
      }
      let res = await fetchPage(params.mode, params.mode === 'barcode' ? params.term.replace(/[\s-]/g, '') : params.term)
      if (params.mode === 'q' && res.results.length === 0) {
        const byCatno = await fetchPage('catno', params.term)
        if (byCatno.results.length > 0) res = byCatno
      }
      const status = await api<Status>(`/status?ids=${res.results.map((r) => r.id).join(',')}`)
      if (mine !== latest.current) return // a newer search or page was requested meanwhile
      setStatus(status)
      setData(res)
      setSearched(params)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Search failed')
    } finally {
      if (mine === latest.current) setLoading(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (term.trim()) void run({ mode: modeFor(term.trim()), term: term.trim(), allFormats }, 1)
  }

  function scanned(code: string) {
    setScanning(false)
    setTerm(code)
    void run({ mode: 'barcode', term: code, allFormats }, 1)
  }

  async function add(r: SearchResult, target: 'collection' | 'wishlist') {
    const owned = status.owned[r.id] ?? 0
    if (target === 'collection' && owned > 0) {
      const another = await confirm({
        title: 'You already own this',
        message: `You have ${owned === 1 ? 'a copy' : `${owned} copies`} of “${r.title}”. Add another copy?`,
        confirmLabel: 'Add another copy',
      })
      if (!another) return
    }
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

  return (
    <div className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:pt-[8vh]" onMouseDown={(e) => !manual && e.target === e.currentTarget && onClose()}>
      {manual ? (
        <ManualRecord target={defaultTarget} onBack={() => setManual(false)} onClose={onClose} onAdded={onAdded} />
      ) : (
      <div className="w-full max-w-2xl rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-800 px-4 py-3">
          <h2 className="font-semibold">{defaultTarget === 'wishlist' ? 'Find a record to wishlist' : 'Add a record from Discogs'}</h2>
          <button onClick={onClose} aria-label="Close" className="text-ink-500 hover:text-ink-100">
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3 border-b border-ink-800 p-4">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <input
                ref={inputRef}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Artist, album, label, catalog # or barcode…"
                className="w-full rounded-md border border-ink-700 bg-ink-950 py-2 pl-3 pr-8 text-sm outline-none focus:border-wax"
              />
              {term && (
                <button
                  type="button"
                  onClick={() => {
                    setTerm('')
                    inputRef.current?.focus()
                  }}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-100"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            {!IS_DEMO && canScan() && (
              <button
                type="button"
                onClick={() => setScanning(true)}
                aria-label="Scan a barcode"
                title="Scan a barcode"
                className="rounded-md border border-ink-700 px-3 text-ink-300 hover:border-wax hover:text-wax"
              >
                <ScanBarcode className="size-4" />
              </button>
            )}
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
          <p className="px-2 py-3 text-center text-xs text-ink-500">
            Not on Discogs?{' '}
            <button type="button" onClick={() => setManual(true)} className="text-wax hover:underline">
              Add it manually
            </button>
          </p>
        </div>
      </div>
      )}
      {scanning && <BarcodeScanner onScan={scanned} onClose={() => setScanning(false)} />}
    </div>
  )
}
