import { ArrowLeft, Heart, Lightbulb, Link2, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth'
import Market, { money } from '../Market'
import { api, GRADES, type Grade, type OwnedCopy, type ReleaseDetail, type Trivia } from '../api'
import { useCrates } from '../crates'
import CollectionPicker from '../CollectionPicker'
import LinkDiscogs from '../LinkDiscogs'
import ManualRecord from '../ManualRecord'
import { useDialog, useToast } from '../notify'
import Cover from '../Cover'

const select = 'rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-sm outline-none focus:border-wax'

/** Asking price field that saves on blur or Enter, in the owner's currency. */
function PriceInput({ copy, currency, onSave }: { copy: OwnedCopy; currency: string; onSave: (price: number | null) => void }) {
  const [value, setValue] = useState(copy.askingPrice?.toString() ?? '')
  useEffect(() => setValue(copy.askingPrice?.toString() ?? ''), [copy.askingPrice])

  function commit() {
    const n = value.trim() === '' ? null : Number(value.replace(',', '.'))
    if (n !== null && (!Number.isFinite(n) || n <= 0)) return setValue(copy.askingPrice?.toString() ?? '')
    if (n !== copy.askingPrice) onSave(n)
  }

  return (
    <label className="flex items-center gap-2 text-ink-500">
      Price
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        placeholder="0.00"
        className={`${select} w-24`}
      />
      <span className="text-xs">{copy.priceCurrency ?? currency}</span>
    </label>
  )
}

export default function Release() {
  const { id } = useParams()
  // Pages that link here (a friend's collection) say where "back" should go; otherwise it's your collection.
  const back = (useLocation().state as { back?: { to: string; label: string } } | null)?.back ?? { to: '/', label: 'Collection' }
  const { user } = useAuth()
  const [data, setData] = useState<{ release: ReleaseDetail; copies: OwnedCopy[]; wishlisted: { id: number } | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [trivia, setTrivia] = useState<Trivia | null>(null)
  const { groups, refresh } = useCrates()
  const [friends, setFriends] = useState<Array<{ id: number; name: string }>>([])
  const [editing, setEditing] = useState(false)
  const [linking, setLinking] = useState(false)
  const toast = useToast()
  const { confirm } = useDialog()
  const navigate = useNavigate()

  const load = useCallback(async () => {
    try {
      const [detail] = await Promise.all([api<never>(`/releases/${id}`), refresh()])
      setData(detail)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load release')
    }
  }, [id, refresh])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    api<{ users: Array<{ id: number; name: string }> }>('/friends/users')
      .then((r) => setFriends(r.users))
      .catch(() => {})
  }, [])

  // Trivia is a bonus fetched on its own, so a slow or failed Wikipedia lookup never delays the page.
  useEffect(() => {
    let current = true
    setTrivia(null)
    api<{ trivia: Trivia | null }>(`/releases/${id}/trivia`)
      .then((r) => current && setTrivia(r.trivia))
      .catch(() => {})
    return () => {
      current = false
    }
  }, [id])

  async function act(fn: () => Promise<unknown>, success: string) {
    try {
      await fn()
      await load()
      toast.success(success)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  const patch = (copyId: number, body: Partial<Pick<OwnedCopy, 'mediaCondition' | 'sleeveCondition' | 'notes' | 'askingPrice' | 'coOwnerId'>> & { forSale?: boolean }) =>
    act(() => api(`/collection/${copyId}`, { method: 'PATCH', json: body }), 'Saved')

  const addCopy = () =>
    act(() => api('/collection', { method: 'POST', json: { releaseId: Number(id) } }), data?.copies.length ? 'Added another copy to your collection' : 'Added to your collection')

  const toggleWishlist = () =>
    data?.wishlisted
      ? act(() => api(`/wishlist/${data.wishlisted!.id}`, { method: 'DELETE' }), 'Removed from your wishlist')
      : act(() => api('/wishlist', { method: 'POST', json: { releaseId: Number(id) } }), 'Added to your wishlist')

  async function remove(copyId: number) {
    const mine = data?.copies.find((c) => c.copyId === copyId)
    if (mine && mine.ownerId !== user?.id) {
      const leave = await confirm({
        title: 'Remove this from your collection?',
        message: `${mine.ownerName} added this copy. It stays in their collection, and just stops being shared with you.`,
        confirmLabel: 'Remove',
        danger: true,
      })
      if (leave) {
        await act(() => api(`/collection/${copyId}`, { method: 'DELETE' }), 'Removed from your collection')
        if (data?.copies.length === 1) navigate('/', { replace: true })
      }
      return
    }
    const last = data?.copies.length === 1
    // A hand-added record with no copies and no wishlist entry would be unreachable, so it goes with its last copy.
    const withRecord = last && Number(id) < 0 && !data?.wishlisted
    const ok = await confirm({
      title: withRecord ? 'Remove this record?' : 'Remove this copy?',
      message: withRecord
        ? 'This record you added by hand will be deleted along with its only copy. This cannot be undone.'
        : mine?.coOwnerId
          ? `It will be deleted from ${mine.coOwnerName}'s collection too.`
          : 'It will be taken out of your collection and any crates it is in.',
      confirmLabel: withRecord ? 'Delete record' : 'Remove copy',
      danger: true,
    })
    if (!ok) return
    if (withRecord) {
      try {
        await api(`/releases/${id}`, { method: 'DELETE' })
        toast.success('Record deleted')
        navigate('/', { replace: true })
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not delete the record')
      }
      return
    }
    await act(() => api(`/collection/${copyId}`, { method: 'DELETE' }), 'Copy removed from your collection')
    if (last) navigate('/', { replace: true })
  }

  async function markSold(copyId: number) {
    const shared = data?.copies.find((c) => c.copyId === copyId)?.coOwnerName
    const ok = await confirm({
      title: 'Mark as sold?',
      message: `It will be removed from your collection${shared ? ` and from ${shared}'s` : ''}, and friends who follow your activity will see that you sold it.`,
      confirmLabel: 'Mark as sold',
    })
    if (!ok) return
    await act(() => api(`/collection/${copyId}/sold`, { method: 'POST' }), 'Marked as sold')
    if (data?.copies.length === 1) navigate('/', { replace: true })
  }

  async function deleteRecord() {
    const ok = await confirm({
      title: 'Delete this record?',
      message: 'This record you added by hand will be deleted, together with your copies of it and any wishlist entry. This cannot be undone.',
      confirmLabel: 'Delete record',
      danger: true,
    })
    if (!ok) return
    try {
      await api(`/releases/${id}`, { method: 'DELETE' })
      toast.success('Record deleted')
      navigate('/', { replace: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the record')
    }
  }

  if (error) return <p className="text-sm text-danger">{error}</p>
  if (!data) return null
  const { release: r, copies, wishlisted } = data

  const meta = [
    ['Label', [r.label, r.catno].filter(Boolean).join(' · ')],
    ['Format', r.format],
    ['Country', r.country],
    ['Year', r.year],
    ['Barcode', r.barcode],
    ['Genre', [...r.genres, ...r.styles].join(', ')],
  ].filter(([, v]) => v)

  return (
    <div className="space-y-8">
      <Link to={back.to} className="inline-flex items-center gap-1.5 text-sm text-ink-300 hover:text-ink-100">
        <ArrowLeft className="size-4" /> {back.label}
      </Link>

      <div className="grid gap-8 md:grid-cols-[320px_1fr]">
        <Cover full releaseId={r.id} hasCover={!!r.hasCover} className="w-full max-w-sm rounded-lg shadow-2xl shadow-black/50 ring-1 ring-ink-800" />
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{r.title}</h1>
            <p className="mt-1 text-lg text-ink-300">{r.artist}</p>
            {r.id < 0 && (
              <div className="mt-3 space-y-2 text-sm">
                <p className="text-ink-500">Added by hand, so it isn’t synced to Discogs. Link it to its Discogs release to sync.</p>
                <div className="flex flex-wrap gap-4">
                <button onClick={() => setLinking(true)} className="flex items-center gap-1.5 text-wax hover:underline">
                  <Link2 className="size-3.5" /> Link to Discogs
                </button>
                <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-ink-300 hover:text-ink-100">
                  <Pencil className="size-3.5" /> Edit record
                </button>
                <button onClick={() => void deleteRecord()} className="flex items-center gap-1.5 text-ink-500 hover:text-danger">
                  <Trash2 className="size-3.5" /> Delete record
                </button>
                </div>
              </div>
            )}
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
            {meta.map(([k, v]) => (
              <div key={k as string} className="contents">
                <dt className="text-ink-500">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>

          {trivia && (
            <aside className="space-y-2 rounded-lg border border-ink-800 bg-ink-900/60 p-4 text-sm">
              <h2 className="flex items-center gap-2 font-medium text-ink-300">
                <Lightbulb className="size-4 text-wax" /> {trivia.source === 'artist' ? `About ${r.artist}` : 'Did you know?'}
              </h2>
              <ul className="list-disc space-y-1.5 pl-5 marker:text-ink-700">
                {trivia.facts.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {trivia.url && (
                <p className="text-xs text-ink-500">
                  From{' '}
                  <a href={trivia.url} target="_blank" rel="noreferrer" className="hover:text-wax hover:underline">
                    “{trivia.title}” on Wikipedia
                  </a>
                  , available under CC BY-SA 4.0.
                </p>
              )}
            </aside>
          )}

          <section className="space-y-1.5">
            {r.id > 0 && (
              <>
                <h2 className="text-sm font-medium text-ink-300">On Discogs marketplace</h2>
                <Market releaseId={r.id} currency={user?.currency ?? 'USD'} search={`${r.artist} ${r.title}`} />
              </>
            )}
            {copies.some((c) => c.forSale && c.askingPrice != null) && (
              <p className="text-xs text-ink-500">
                Your asking {copies.filter((c) => c.forSale && c.askingPrice != null).length === 1 ? 'price' : 'prices'}:{' '}
                {copies
                  .filter((c) => c.forSale && c.askingPrice != null)
                  .map((c) => money(c.askingPrice!, c.priceCurrency ?? user?.currency ?? 'USD'))
                  .join(', ')}
              </p>
            )}
          </section>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => void addCopy()} className="flex items-center gap-2 rounded-md bg-wax px-4 py-2 text-sm font-medium text-on-wax hover:bg-wax-hover">
              <Plus className="size-4" /> {copies.length ? 'Add another copy' : 'Add to collection'}
            </button>
            {copies.length === 0 && (
              <button
                onClick={() => void toggleWishlist()}
                className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm ${wishlisted ? 'border-wax text-wax' : 'border-ink-700 hover:border-wax'}`}
              >
                <Heart className={`size-4 ${wishlisted ? 'fill-current' : ''}`} /> {wishlisted ? 'On your wishlist' : 'Wishlist'}
              </button>
            )}
          </div>

          <section className={`space-y-3 ${copies.length ? '' : 'hidden'}`}>
            <h2 className="text-sm font-medium text-ink-300">Your {copies.length === 1 ? 'copy' : 'copies'}</h2>
            {copies.map((c) => (
              <div key={c.copyId} className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-800 bg-ink-900/60 p-3 text-sm">
                {(['mediaCondition', 'sleeveCondition'] as const).map((field) => (
                  <label key={field} className="flex items-center gap-2 text-ink-500">
                    {field === 'mediaCondition' ? 'Media' : 'Sleeve'}
                    <select
                      className={select}
                      value={c[field] ?? ''}
                      onChange={(e) => void patch(c.copyId, { [field]: (e.target.value || null) as Grade | null })}
                    >
                      <option value="">—</option>
                      {GRADES.map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </select>
                  </label>
                ))}
                <label className="flex items-center gap-2 text-ink-500">
                  <input
                    type="checkbox"
                    checked={!!c.forSale}
                    onChange={(e) => void patch(c.copyId, { forSale: e.target.checked })}
                    className="accent-wax"
                  />
                  For sale
                </label>
                {!!c.forSale && c.ownerId === user?.id && (
                  <button onClick={() => void markSold(c.copyId)} className="rounded-md border border-ink-700 px-2.5 py-1 text-xs text-ink-300 hover:border-wax hover:text-ink-100">
                    Mark as sold
                  </button>
                )}
                {!!c.forSale && <PriceInput copy={c} currency={user?.currency ?? 'USD'} onSave={(askingPrice) => void patch(c.copyId, { askingPrice })} />}
                {c.ownerId === user?.id ? (
                  friends.length > 0 && (
                    <label className="flex items-center gap-2 text-ink-500">
                      <Users className="size-4" aria-hidden="true" />
                      Shared with
                      <select
                        className={select}
                        value={c.coOwnerId ?? ''}
                        onChange={(e) => void patch(c.copyId, { coOwnerId: e.target.value ? Number(e.target.value) : null })}
                      >
                        <option value="">Nobody</option>
                        {friends.map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </label>
                  )
                ) : (
                  <span className="flex items-center gap-1.5 text-ink-500">
                    <Users className="size-4" aria-hidden="true" /> Shared by {c.ownerName}
                  </span>
                )}
                <span className="flex-1 text-xs text-ink-500">Added {c.addedAt.slice(0, 10)}</span>
                {c.ownerId === user?.id && (
                  <CollectionPicker variant="inline" copyId={c.copyId} selected={c.collectionIds} groups={groups} onChanged={() => void load()} />
                )}
                <button onClick={() => void remove(c.copyId)} className="text-ink-500 hover:text-danger" aria-label="Remove copy">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </section>

          {r.tracklist.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-medium text-ink-300">Tracklist</h2>
              <ol className="divide-y divide-ink-800 rounded-lg border border-ink-800 text-sm">
                {r.tracklist.map((t, i) => (
                  <li key={i} className="flex gap-3 px-3 py-2">
                    <span className="w-8 shrink-0 text-ink-500">{t.position}</span>
                    <span className="flex-1">{t.title}</span>
                    <span className="text-ink-500">{t.duration}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>

      {linking && (
        <LinkDiscogs
          release={r}
          onClose={() => setLinking(false)}
          onLinked={(releaseId) => {
            setLinking(false)
            navigate(`/release/${releaseId}`, { replace: true })
          }}
        />
      )}
      {editing && (
        <div className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:pt-[8vh]">
          <ManualRecord release={r} onClose={() => setEditing(false)} onAdded={() => void load()} />
        </div>
      )}
    </div>
  )
}
