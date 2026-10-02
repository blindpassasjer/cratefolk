import { ArrowLeft, Heart, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth'
import Market from '../Market'
import { api, GRADES, type CollectionGroup, type Grade, type OwnedCopy, type ReleaseDetail } from '../api'
import CollectionPicker from '../CollectionPicker'
import Cover from '../Cover'

const select = 'rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-sm outline-none focus:border-wax'

export default function Release() {
  const { id } = useParams()
  const { user } = useAuth()
  const [data, setData] = useState<{ release: ReleaseDetail; copies: OwnedCopy[]; wishlisted: { id: number } | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [groups, setGroups] = useState<CollectionGroup[]>([])

  const load = useCallback(async () => {
    try {
      const [detail, g] = await Promise.all([api<never>(`/releases/${id}`), api<{ collections: CollectionGroup[] }>('/collections')])
      setData(detail)
      setGroups(g.collections)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load release')
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function patch(copyId: number, body: Partial<Pick<OwnedCopy, 'mediaCondition' | 'sleeveCondition' | 'notes'>>) {
    await api(`/collection/${copyId}`, { method: 'PATCH', json: body })
    await load()
  }

  async function addCopy() {
    await api('/collection', { method: 'POST', json: { releaseId: Number(id) } })
    await load()
  }

  async function toggleWishlist() {
    if (data?.wishlisted) await api(`/wishlist/${data.wishlisted.id}`, { method: 'DELETE' })
    else await api('/wishlist', { method: 'POST', json: { releaseId: Number(id) } })
    await load()
  }

  async function remove(copyId: number) {
    if (!window.confirm('Remove this copy from your collection?')) return
    await api(`/collection/${copyId}`, { method: 'DELETE' })
    await load()
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
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-ink-300 hover:text-ink-100">
        <ArrowLeft className="size-4" /> Collection
      </Link>

      <div className="grid gap-8 md:grid-cols-[320px_1fr]">
        <Cover releaseId={r.id} hasCover={!!r.hasCover} className="w-full max-w-sm rounded-lg shadow-2xl shadow-black/50 ring-1 ring-ink-800" />
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{r.title}</h1>
            <p className="mt-1 text-lg text-ink-300">{r.artist}</p>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
            {meta.map(([k, v]) => (
              <div key={k as string} className="contents">
                <dt className="text-ink-500">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>

          <section className="space-y-1.5">
            <h2 className="text-sm font-medium text-ink-300">On Discogs marketplace</h2>
            <Market releaseId={r.id} currency={user?.currency ?? 'USD'} />
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
                <span className="flex-1 text-xs text-ink-500">Added {c.addedAt.slice(0, 10)}</span>
                <CollectionPicker variant="inline" copyId={c.copyId} selected={c.collectionIds} groups={groups} onChanged={() => void load()} />
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
    </div>
  )
}
