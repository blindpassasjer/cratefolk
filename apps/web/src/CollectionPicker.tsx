import { Check, FolderPlus, Plus } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, type CollectionGroup } from './api'
import { useToast } from './notify'

/** Popover for choosing which of the user's crates a copy belongs to. */
export default function CollectionPicker({
  copyId,
  selected,
  groups,
  onChanged,
  variant = 'overlay',
}: {
  copyId: number
  selected: number[]
  groups: CollectionGroup[]
  onChanged: () => void
  variant?: 'overlay' | 'inline'
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const toast = useToast()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function toggle(g: CollectionGroup) {
    const removing = selected.includes(g.id)
    try {
      await api(`/collections/${g.id}/copies/${copyId}`, { method: removing ? 'DELETE' : 'PUT' })
      toast.success(removing ? `Removed from “${g.name}”` : `Added to “${g.name}”`)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    try {
      const { collection } = await api<{ collection: CollectionGroup }>('/collections', { method: 'POST', json: { name } })
      await api(`/collections/${collection.id}/copies/${copyId}`, { method: 'PUT' })
      toast.success(`Created “${collection.name}” and added this record`)
      setName('')
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  const trigger =
    variant === 'overlay'
      ? 'rounded-md bg-black/60 p-1.5 text-white backdrop-blur hover:bg-black/80'
      : 'flex items-center gap-1.5 rounded-md border border-ink-700 px-2.5 py-1 text-xs text-ink-300 hover:border-wax hover:text-ink-100'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Add to crate"
        title="Crates"
        className={`${trigger} ${selected.length ? 'ring-1 ring-wax' : ''}`}
      >
        <FolderPlus className="size-4" />
        {variant === 'inline' && (selected.length ? `${selected.length} crate${selected.length > 1 ? 's' : ''}` : 'Crates')}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-60 rounded-lg border border-ink-700 bg-ink-900 p-1.5 text-sm text-ink-100 shadow-xl">
          {groups.length === 0 && <p className="px-2 py-2 text-xs text-ink-500">No crates yet. Create your first below.</p>}
          <ul className="max-h-52 overflow-y-auto">
            {groups.map((g) => (
              <li key={g.id}>
                <button onClick={() => void toggle(g)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-ink-800">
                  <span className={`flex size-4 shrink-0 items-center justify-center rounded border ${selected.includes(g.id) ? 'border-wax bg-wax' : 'border-ink-500'}`}>
                    {selected.includes(g.id) && <Check className="size-3 text-on-wax" />}
                  </span>
                  <span className="truncate">{g.name}</span>
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={create} className="mt-1 flex gap-1.5 border-t border-ink-800 p-1.5 pt-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New crate…"
              maxLength={60}
              className="min-w-0 flex-1 rounded border border-ink-700 bg-ink-950 px-2 py-1 text-xs outline-none focus:border-wax"
            />
            <button aria-label="Create crate" className="rounded bg-wax px-2 text-on-wax hover:bg-wax-hover">
              <Plus className="size-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
