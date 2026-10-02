import { Check, Pencil, Trash2, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { api, type CollectionGroup } from './api'

/** Rename and delete the user's collections. Deleting a collection never deletes its records. */
export default function ManageCollections({
  groups,
  onClose,
  onChanged,
}: {
  groups: CollectionGroup[]
  onClose: () => void
  onChanged: (deletedId?: number) => void
}) {
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [confirming, setConfirming] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function run(fn: () => Promise<unknown>, after: () => void) {
    setError(null)
    try {
      await fn()
      after()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  function startEdit(g: CollectionGroup) {
    setConfirming(null)
    setEditing(g.id)
    setDraft(g.name)
  }

  function save(e: FormEvent, g: CollectionGroup) {
    e.preventDefault()
    if (!draft.trim() || draft.trim() === g.name) return setEditing(null)
    void run(
      () => api(`/collections/${g.id}`, { method: 'PATCH', json: { name: draft } }),
      () => {
        setEditing(null)
        onChanged()
      },
    )
  }

  function remove(g: CollectionGroup) {
    void run(
      () => api(`/collections/${g.id}`, { method: 'DELETE' }),
      () => {
        setConfirming(null)
        onChanged(g.id)
      },
    )
  }

  const iconBtn = 'rounded-md p-2 text-ink-500 transition-colors hover:text-ink-100'

  return (
    <div className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:pt-[10vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-800 px-4 py-3">
          <h2 className="font-semibold">Manage collections</h2>
          <button onClick={onClose} aria-label="Close" className="text-ink-500 hover:text-ink-100">
            <X className="size-5" />
          </button>
        </div>

        <div className="p-2">
          {groups.length === 0 && <p className="px-3 py-6 text-center text-sm text-ink-500">You have no collections yet.</p>}
          <ul>
            {groups.map((g) => (
              <li key={g.id} className="rounded-lg px-2 py-1.5 hover:bg-ink-800/60">
                {editing === g.id ? (
                  <form onSubmit={(e) => save(e, g)} className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setEditing(null))}
                      maxLength={60}
                      aria-label="Collection name"
                      className="min-w-0 flex-1 rounded-md border border-ink-700 bg-ink-950 px-3 py-1.5 text-sm outline-none focus:border-wax"
                    />
                    <button className="rounded-md bg-wax p-2 text-on-wax hover:bg-wax-hover" aria-label="Save name">
                      <Check className="size-4" />
                    </button>
                    <button type="button" onClick={() => setEditing(null)} className={iconBtn} aria-label="Cancel">
                      <X className="size-4" />
                    </button>
                  </form>
                ) : confirming === g.id ? (
                  <div className="flex items-center gap-2 py-1 text-sm">
                    <span className="min-w-0 flex-1">
                      Delete <strong className="font-medium">{g.name}</strong>? Its {g.count} {g.count === 1 ? 'record stays' : 'records stay'} in your library.
                    </span>
                    <button onClick={() => remove(g)} className="rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
                      Delete
                    </button>
                    <button onClick={() => setConfirming(null)} className="rounded-md border border-ink-700 px-3 py-1.5 text-xs hover:border-ink-500">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="min-w-0 flex-1 truncate text-sm">{g.name}</span>
                    <span className="mr-1 text-xs text-ink-500">{g.count}</span>
                    <button onClick={() => startEdit(g)} className={iconBtn} aria-label={`Rename ${g.name}`} title="Rename">
                      <Pencil className="size-4" />
                    </button>
                    <button onClick={() => { setEditing(null); setConfirming(g.id) }} className={`${iconBtn} hover:text-danger`} aria-label={`Delete ${g.name}`} title="Delete">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {error && <p className="px-3 py-2 text-sm text-danger">{error}</p>}
        </div>
      </div>
    </div>
  )
}
