import { Disc3, Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AddRecord from '../AddRecord'
import { api, type Copy } from '../api'
import Cover from '../Cover'

export default function Collection() {
  const [copies, setCopies] = useState<Copy[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setCopies((await api<{ copies: Copy[] }>('/collection')).copies)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your collection')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Collection</h1>
          {copies && <p className="text-sm text-ink-500">{copies.length} {copies.length === 1 ? 'record' : 'records'}</p>}
        </div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 rounded-md bg-wax px-4 py-2 text-sm font-medium text-ink-950 hover:bg-wax-hover">
          <Plus className="size-4" /> Add record
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {copies?.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <Disc3 className="size-12 text-ink-700" />
          <h2 className="text-xl font-semibold">Your crate is empty</h2>
          <p className="max-w-sm text-sm text-ink-500">Search Discogs by name, catalog number or barcode to add your first record.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {copies?.map((c) => (
          <Link key={c.copyId} to={`/release/${c.releaseId}`} className="group block">
            <Cover releaseId={c.releaseId} hasCover={!!c.hasCover} className="rounded-md shadow-lg shadow-black/40 ring-1 ring-ink-800 transition group-hover:-translate-y-0.5 group-hover:ring-wax/60" />
            <div className="mt-2 truncate text-sm font-medium">{c.title}</div>
            <div className="truncate text-xs text-ink-500">{[c.artist, c.year].filter(Boolean).join(' · ')}</div>
          </Link>
        ))}
      </div>

      {adding && <AddRecord onClose={() => setAdding(false)} onAdded={() => void load()} />}
    </div>
  )
}
