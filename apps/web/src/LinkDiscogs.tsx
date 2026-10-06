import { Disc3, Loader2, Search, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, type ReleaseDetail, type SearchResponse, type SearchResult } from './api'
import { useDialog, useToast } from './notify'

/** Finds the Discogs release behind a hand-added record. Linking it moves its copies there, so they sync to Discogs. */
export default function LinkDiscogs({ release, onClose, onLinked }: { release: ReleaseDetail; onClose: () => void; onLinked: (releaseId: number) => void }) {
  const [term, setTerm] = useState(`${release.artist} ${release.title}`.trim())
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [linking, setLinking] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const latest = useRef(0)
  const toast = useToast()
  const { confirm } = useDialog()

  useEffect(() => {
    inputRef.current?.select()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[aria-modal="true"]') && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function search(e?: FormEvent) {
    e?.preventDefault()
    const q = term.trim()
    if (!q) return
    const mine = ++latest.current
    setLoading(true)
    try {
      const digits = q.replace(/[\s-]/g, '')
      const key = /^\d{8,14}$/.test(digits) ? 'barcode' : 'q'
      let res = await api<SearchResponse>(`/discogs/search?${new URLSearchParams({ [key]: key === 'barcode' ? digits : q, allFormats: '1' })}`)
      if (key === 'q' && res.results.length === 0 && release.catno) res = await api<SearchResponse>(`/discogs/search?${new URLSearchParams({ catno: release.catno, allFormats: '1' })}`)
      if (mine === latest.current) setResults(res.results)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Search failed')
    } finally {
      if (mine === latest.current) setLoading(false)
    }
  }

  async function link(r: SearchResult) {
    const ok = await confirm({
      title: 'Link to this Discogs release?',
      message: `Your copies of “${release.title}” will move to “${r.title}”. Details you entered by hand, like the cover and tracklist, are replaced by Discogs’ and the manual record is deleted.`,
      confirmLabel: 'Link',
    })
    if (!ok) return
    setLinking(r.id)
    try {
      const res = await api<{ releaseId: number }>(`/releases/${release.id}/link`, { method: 'POST', json: { discogsId: r.id } })
      toast.success('Linked to Discogs')
      onLinked(res.releaseId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not link record')
    } finally {
      setLinking(null)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:pt-[8vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-xl rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-800 px-4 py-3">
          <h2 className="font-semibold">Link to Discogs</h2>
          <button onClick={onClose} aria-label="Close" className="text-ink-500 hover:text-ink-100">
            <X className="size-5" />
          </button>
        </div>
        <form onSubmit={(e) => void search(e)} className="flex gap-2 border-b border-ink-800 p-3">
          <input
            ref={inputRef}
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Artist, title, catalog number or barcode"
            className="min-w-0 flex-1 rounded-md border border-ink-700 bg-ink-950 px-3 py-2 text-sm outline-none focus:border-wax"
          />
          <button className="flex items-center gap-2 rounded-md bg-wax px-4 py-2 text-sm font-medium text-on-wax hover:bg-wax-hover">
            <Search className="size-4" /> Search
          </button>
        </form>
        <div className="p-2">
          {loading && (
            <div className="flex justify-center py-10 text-ink-500">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )}
          {!loading && results && results.length === 0 && <p className="px-2 py-8 text-center text-sm text-ink-500">No releases found.</p>}
          {!loading && !results && <p className="px-2 py-8 text-center text-sm text-ink-500">Search for the release on Discogs.</p>}
          {!loading && (
            <ul>
              {results?.map((r) => (
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
                    <div className="truncate text-xs text-ink-500">{[r.year, r.country, r.format].filter(Boolean).join(' · ')}</div>
                    <div className="truncate text-xs text-ink-500">{[r.label, r.catno, r.barcode].filter(Boolean).join(' · ')}</div>
                  </div>
                  <button
                    onClick={() => void link(r)}
                    disabled={linking !== null}
                    className="flex shrink-0 items-center gap-1.5 rounded-md border border-ink-700 px-3 py-1.5 text-xs hover:border-wax disabled:opacity-60"
                  >
                    {linking === r.id && <Loader2 className="size-3.5 animate-spin" />} Link
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
