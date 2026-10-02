import { Archive, BarChart3, Disc3, Heart, LogOut, Plus, Settings2, Tag, UserRound, X } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { api, type CollectionGroup } from './api'
import { useAuth } from './auth'
import { useCrates } from './crates'
import { Logo } from './Logo'
import ManageCollections from './ManageCollections'
import { useToast } from './notify'

// Search text, sort and filters survive switching between crates.
const KEEP = ['q', 'sort', 'format', 'decade', 'country']

const item = (active: boolean) =>
  `flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
    active ? 'bg-ink-800 text-ink-100' : 'text-ink-300 hover:bg-ink-900 hover:text-ink-100'
  }`

function Count({ children }: { children: ReactNode }) {
  return <span className="ml-auto text-xs tabular-nums text-ink-500">{children}</span>
}

/** Navigation: Collection with its crates, Wishlist and Stats, plus the account on phones (wide screens have it in the top bar). A drawer on phones, a fixed panel on wide screens. */
export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth()
  const { groups, totals, refresh, manage } = useCrates()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const onCollection = pathname === '/'
  const activeId = Number(params.get('c')) || null
  const sale = params.get('sale') === '1'

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const collectionHref = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams(extra)
    if (onCollection) for (const k of KEEP) if (params.get(k)) p.set(k, params.get(k)!)
    const qs = p.toString()
    return qs ? `/?${qs}` : '/'
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    try {
      const { collection } = await api<{ collection: CollectionGroup }>('/collections', { method: 'POST', json: { name: newName } })
      setNewName('')
      setCreating(false)
      await refresh()
      navigate(collectionHref({ c: String(collection.id) }))
      toast.success(`Created the crate “${collection.name}”`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the crate')
    }
  }

  const allActive = onCollection && !activeId && !sale

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        aria-label="Navigation"
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-ink-800 bg-ink-950 transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:shrink-0 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between px-4">
          <Link to="/" onClick={onClose}>
            <Logo />
          </Link>
          <button onClick={onClose} aria-label="Close menu" className="rounded-md p-1.5 text-ink-500 hover:text-ink-100 lg:hidden">
            <X className="size-5" />
          </button>
        </div>

        <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-3">
          <div className="space-y-0.5">
            <div className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-ink-500">Collection</div>
            <Link to={collectionHref()} onClick={onClose} className={item(allActive)}>
              <Disc3 className="size-4" /> All records {totals && <Count>{totals.records}</Count>}
            </Link>
            {((totals?.forSale ?? 0) > 0 || sale) && (
              <Link to={collectionHref({ sale: '1' })} onClick={onClose} className={item(onCollection && sale)}>
                <Tag className="size-4" /> For sale <Count>{totals?.forSale ?? 0}</Count>
              </Link>
            )}
            {groups.map((g) => (
              <Link key={g.id} to={collectionHref({ c: String(g.id) })} onClick={onClose} className={item(onCollection && g.id === activeId)}>
                <Archive className="size-4 shrink-0" /> <span className="truncate">{g.name}</span> <Count>{g.count}</Count>
              </Link>
            ))}
            {creating ? (
              <form onSubmit={create} className="flex gap-1.5 px-1 pt-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setCreating(false))}
                  placeholder="Crate name"
                  maxLength={60}
                  className="min-w-0 flex-1 rounded-md border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-sm outline-none focus:border-wax"
                />
                <button className="rounded-md bg-wax px-2.5 text-sm font-medium text-on-wax hover:bg-wax-hover">Add</button>
              </form>
            ) : (
              <div className="flex items-center">
                <button onClick={() => setCreating(true)} className="flex flex-1 items-center gap-2.5 rounded-md px-3 py-2 text-sm text-ink-500 hover:text-ink-100">
                  <Plus className="size-4" /> New crate
                </button>
                {groups.length > 0 && (
                  <button onClick={manage} aria-label="Manage crates" title="Rename or delete crates" className="rounded-md p-2 text-ink-500 hover:text-ink-100">
                    <Settings2 className="size-4" />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="space-y-0.5 border-t border-ink-800 pt-3">
            <Link to="/wishlist" onClick={onClose} className={item(pathname === '/wishlist')}>
              <Heart className="size-4" /> Wishlist
            </Link>
            <Link to="/stats" onClick={onClose} className={item(pathname === '/stats')}>
              <BarChart3 className="size-4" /> Stats
            </Link>
          </div>
        </nav>

      </aside>
    </>
  )
}

/** The rename/delete crates dialog. Lives outside the sidebar because a transformed drawer would clip a fixed overlay. */
export function CrateManager() {
  const { groups, managing, closeManage, refresh } = useCrates()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  if (!managing) return null
  return (
    <ManageCollections
      groups={groups}
      onClose={closeManage}
      onChanged={(deletedId) => {
        if (deletedId && deletedId === Number(params.get('c'))) {
          closeManage()
          navigate('/')
        }
        void refresh()
      }}
    />
  )
}
