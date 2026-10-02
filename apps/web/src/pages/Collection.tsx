import { Disc3, Pencil, Plus, Settings2, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AddRecord from '../AddRecord'
import { api, type CollectionGroup, type Copy } from '../api'
import CollectionPicker from '../CollectionPicker'
import Cover from '../Cover'
import ManageCollections from '../ManageCollections'
import ShareExport from '../ShareExport'

export default function Collection() {
  const [params, setParams] = useSearchParams()
  const activeId = Number(params.get('c')) || null

  const [copies, setCopies] = useState<Copy[] | null>(null)
  const [groups, setGroups] = useState<CollectionGroup[]>([])
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [managing, setManaging] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const active = groups.find((g) => g.id === activeId) ?? null

  const loadGroups = useCallback(async () => {
    setGroups((await api<{ collections: CollectionGroup[] }>('/collections')).collections)
  }, [])

  const load = useCallback(async () => {
    try {
      const qs = activeId ? `?collection=${activeId}` : ''
      const [{ copies }] = await Promise.all([api<{ copies: Copy[] }>(`/collection${qs}`), loadGroups()])
      setCopies(copies)
      if (!activeId) setTotalCount(copies.length)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your collection')
    }
  }, [activeId, loadGroups])

  useEffect(() => {
    void load()
  }, [load])

  // The "All records" count needs the unfiltered total even while a collection is open.
  useEffect(() => {
    if (activeId) void api<{ copies: Copy[] }>('/collection').then((r) => setTotalCount(r.copies.length))
  }, [activeId, copies])

  function select(id: number | null) {
    setParams(id ? { c: String(id) } : {})
  }

  async function run(fn: () => Promise<unknown>) {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
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
    })
  }

  const chip = (isActive: boolean) =>
    `shrink-0 rounded-full border px-3 py-1 text-sm transition-colors ${
      isActive ? 'border-wax bg-wax text-on-wax' : 'border-ink-700 text-ink-300 hover:border-ink-500 hover:text-ink-100'
    }`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{active ? active.name : 'Collection'}</h1>
          {copies && <p className="text-sm text-ink-500">{copies.length} {copies.length === 1 ? 'record' : 'records'}</p>}
        </div>
        <div className="flex items-center gap-2">
          {active && (
            <>
              <button onClick={() => setManaging(true)} className="flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm text-ink-300 hover:text-ink-100">
                <Pencil className="size-4" /> Rename
              </button>
              <button onClick={() => setManaging(true)} className="flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm text-ink-300 hover:text-danger">
                <Trash2 className="size-4" /> Delete
              </button>
            </>
          )}
          <ShareExport
            key={activeId ?? 'all'}
            kind={activeId ? 'group' : 'all'}
            collectionId={activeId ?? undefined}
            exportHref={`/api/export/collection.xlsx${activeId ? `?collection=${activeId}` : ''}`}
          />
          <button onClick={() => setAdding(true)} className="flex items-center gap-2 rounded-md bg-wax px-4 py-2 text-sm font-medium text-on-wax hover:bg-wax-hover">
            <Plus className="size-4" /> Add record
          </button>
        </div>
      </div>

      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1">
        <button onClick={() => select(null)} className={chip(!activeId)}>
          All records{totalCount !== null && <span className="ml-1.5 opacity-70">{totalCount}</span>}
        </button>
        {groups.map((g) => (
          <button key={g.id} onClick={() => select(g.id)} className={chip(g.id === activeId)}>
            {g.name}
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
              placeholder="Collection name"
              maxLength={60}
              className="w-44 rounded-full border border-ink-700 bg-ink-900 px-3 py-1 text-sm outline-none focus:border-wax"
            />
            <button className="rounded-full bg-wax px-3 py-1 text-sm font-medium text-on-wax hover:bg-wax-hover">Create</button>
          </form>
        ) : (
          <button onClick={() => setCreating(true)} className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-ink-700 px-3 py-1 text-sm text-ink-500 hover:border-wax hover:text-ink-100">
            <Plus className="size-3.5" /> New collection
          </button>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {copies?.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <Disc3 className="size-12 text-ink-700" />
          <h2 className="text-xl font-semibold">{active ? 'This collection is empty' : 'Your crate is empty'}</h2>
          <p className="max-w-sm text-sm text-ink-500">
            {active
              ? 'Use the folder icon on any record in All records to add it here.'
              : 'Search Discogs by name, catalog number or barcode to add your first record.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {copies?.map((c) => (
          <div key={c.copyId} className="group relative">
            <Link to={`/release/${c.releaseId}`} className="block">
              <Cover releaseId={c.releaseId} hasCover={!!c.hasCover} className="rounded-md shadow-lg shadow-black/40 ring-1 ring-ink-800 transition group-hover:-translate-y-0.5 group-hover:ring-wax/60" />
              <div className="mt-2 truncate text-sm font-medium">{c.title}</div>
              <div className="truncate text-xs text-ink-500">{[c.artist, c.year].filter(Boolean).join(' · ')}</div>
            </Link>
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
