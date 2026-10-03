import { Disc3, ImagePlus, Loader2, Plus, X } from 'lucide-react'
import { Fragment, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { api, ApiError, type ReleaseDetail } from './api'
import Cover from './Cover'
import { useDialog, useToast } from './notify'

const MAX_COVER_PX = 600

/** Reads an image file and returns it as a downscaled JPEG data: URL. */
async function resizeCover(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_COVER_PX / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
}

type Track = { position: string; title: string; duration: string }
const SIDES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

/** Splits a position like "A1" into side "A" and number "1"; "3" or "1-3" have no side. */
function splitPosition(position: string) {
  const m = /^([A-Za-z])(.*)$/.exec(position)
  return m ? { side: m[1]!.toUpperCase(), num: m[2]! } : { side: '', num: position }
}

/** The track that follows `prev`: same side, next number when it's a plain integer. */
function nextTrack(prev?: Track): Track {
  const { side, num } = splitPosition(prev?.position ?? '')
  const n = /^\d+$/.test(num) ? String(Number(num) + 1) : prev ? '' : '1'
  return { position: `${side}${n}`, title: '', duration: '' }
}

const input = 'w-full rounded-md border border-ink-700 bg-ink-950 px-3 py-2 text-sm outline-none focus:border-wax'

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="text-xs text-ink-500">{label}</span>
      {children}
    </label>
  )
}

/**
 * Form for a record that isn't on Discogs. Without `release` it saves a new one and adds it to the collection or wishlist;
 * with `release` it edits that record in place.
 */
export default function ManualRecord({
  target = 'collection',
  release,
  onBack,
  onClose,
  onAdded,
}: {
  target?: 'collection' | 'wishlist'
  release?: ReleaseDetail
  onBack?: () => void
  onClose: () => void
  onAdded: () => void
}) {
  const editing = !!release
  const [f, setF] = useState({
    title: release?.title ?? '',
    artist: release?.artist ?? '',
    year: release?.year?.toString() ?? '',
    label: release?.label ?? '',
    catno: release?.catno ?? '',
    country: release?.country ?? '',
    format: release ? release.format : 'Vinyl, LP',
    barcode: release?.barcode ?? '',
    genres: release?.genres.join(', ') ?? '',
    tracks: release?.tracklist.map((t) => ({ position: t.position, title: t.title, duration: t.duration })) ?? ([] as Track[]),
    notes: release?.notes ?? '',
  })
  // A data: URL replaces the cover, null removes it, undefined keeps the saved one (editing) or means none (adding).
  const [cover, setCover] = useState<string | null | undefined>(undefined)
  const hasCover = cover ? true : cover === undefined && !!release?.hasCover
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const { confirm } = useDialog()

  useEffect(() => {
    if (!editing) return // while adding, the surrounding dialog already handles Escape
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[aria-modal="true"]') && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, onClose])
  const set = (k: Exclude<keyof typeof f, 'tracks'>) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }))

  const setTrack = (i: number, patch: Partial<Track>) => setF((s) => ({ ...s, tracks: s.tracks.map((t, j) => (j === i ? { ...t, ...patch } : t)) }))
  const addTrack = () => setF((s) => ({ ...s, tracks: [...s.tracks, nextTrack(s.tracks[s.tracks.length - 1])] }))
  const removeTrack = (i: number) => setF((s) => ({ ...s, tracks: s.tracks.filter((_, j) => j !== i) }))

  async function pickCover(file: File | undefined) {
    if (!file) return
    try {
      setCover(await resizeCover(file))
    } catch {
      toast.error('Could not read that image')
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const year = Number(f.year)
      const body = {
        title: f.title,
        artist: f.artist,
        year: f.year && Number.isInteger(year) ? year : null,
        label: f.label,
        catno: f.catno,
        country: f.country,
        format: f.format,
        barcode: f.barcode,
        genres: f.genres.split(',').map((g) => g.trim()).filter(Boolean),
        tracklist: f.tracks.filter((t) => t.title.trim()).map((t) => ({ position: t.position.trim(), title: t.title.trim(), duration: t.duration.trim() })),
        notes: f.notes,
        cover,
      }
      if (release) {
        await api(`/releases/${release.id}`, { method: 'PATCH', json: body })
        toast.success('Saved')
      } else {
        const create = (force?: boolean) => api<{ releaseId: number }>('/releases/manual', { method: 'POST', json: { ...body, force } })
        let created: { releaseId: number }
        try {
          created = await create()
        } catch (err) {
          // Same artist and title already added by hand: let the user decide.
          if (!(err instanceof ApiError && err.status === 409)) throw err
          const again = await confirm({ title: 'Already added', message: `${err.message}. Add it again?`, confirmLabel: 'Add again' })
          if (!again) return setSaving(false)
          created = await create(true)
        }
        await api(`/${target}`, { method: 'POST', json: { releaseId: created.releaseId } })
        toast.success(`Added “${f.title}” to your ${target}`)
      }
      onAdded()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : editing ? 'Could not save changes' : 'Could not add record')
      setSaving(false)
    }
  }

  return (
    <div className="w-full max-w-2xl rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
      <div className="flex items-center justify-between border-b border-ink-800 px-4 py-3">
        <h2 className="font-semibold">{editing ? 'Edit record' : 'Add a record manually'}</h2>
        <button onClick={onClose} aria-label="Close" className="text-ink-500 hover:text-ink-100">
          <X className="size-5" />
        </button>
      </div>
      <form onSubmit={submit} className="space-y-4 p-4">
        <div className="flex gap-4">
          <div className="flex shrink-0 flex-col items-start gap-1.5">
            <label className="group relative flex size-28 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-ink-700 bg-ink-800 hover:border-wax">
              {cover ? (
                <img src={cover} alt="" className="size-full object-cover" />
              ) : hasCover && release ? (
                <Cover full releaseId={release.id} hasCover className="size-full" />
              ) : (
                <Disc3 className="size-8 text-ink-700" />
              )}
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/60 py-1 text-xs text-white">
                <ImagePlus className="size-3" /> {hasCover ? 'Change' : 'Add cover'}
              </span>
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => void pickCover(e.target.files?.[0])} />
            </label>
            {hasCover && (
              <button type="button" onClick={() => setCover(null)} className="text-xs text-ink-500 hover:text-danger">
                Remove
              </button>
            )}
          </div>
          <div className="grid min-w-0 flex-1 gap-3">
            <Field label="Artist *">
              <input required autoFocus value={f.artist} onChange={set('artist')} maxLength={200} className={input} />
            </Field>
            <Field label="Title *">
              <input required value={f.title} onChange={set('title')} maxLength={200} className={input} />
            </Field>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Label">
            <input value={f.label} onChange={set('label')} maxLength={120} className={input} />
          </Field>
          <Field label="Catalog #">
            <input value={f.catno} onChange={set('catno')} maxLength={60} className={input} />
          </Field>
          <Field label="Year">
            <input value={f.year} onChange={set('year')} inputMode="numeric" maxLength={4} className={input} />
          </Field>
          <Field label="Country">
            <input value={f.country} onChange={set('country')} maxLength={60} className={input} />
          </Field>
          <Field label="Format">
            <input value={f.format} onChange={set('format')} maxLength={120} className={input} />
          </Field>
          <Field label="Barcode">
            <input value={f.barcode} onChange={set('barcode')} maxLength={40} className={input} />
          </Field>
        </div>
        <Field label="Genres (comma separated)">
          <input value={f.genres} onChange={set('genres')} className={input} />
        </Field>
        <div className="space-y-1">
          <span className="text-xs text-ink-500">Tracklist</span>
          <div className="grid grid-cols-[4rem_3.5rem_minmax(0,1fr)_5rem_1rem] items-center gap-2">
            {f.tracks.length > 0 && (
              <>
              <span className="text-xs text-ink-500">Side</span>
              <span className="text-xs text-ink-500">Track</span>
              <span className="text-xs text-ink-500">Title</span>
              <span className="text-xs text-ink-500">Duration</span>
                <span />
              </>
            )}
            {f.tracks.map((t, i) => {
              const { side, num } = splitPosition(t.position)
              return (
                <Fragment key={i}>
                  <select value={side} onChange={(e) => setTrack(i, { position: e.target.value + num })} aria-label={`Track ${i + 1} side`} className={input}>
                    <option value="">–</option>
                    {SIDES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <input value={num} onChange={(e) => setTrack(i, { position: side + e.target.value })} aria-label={`Track ${i + 1} number`} placeholder="#" maxLength={9} className={input} />
                  <input value={t.title} onChange={(e) => setTrack(i, { title: e.target.value })} aria-label={`Track ${i + 1} title`} placeholder="Title" maxLength={200} className={input} />
                  <input value={t.duration} onChange={(e) => setTrack(i, { duration: e.target.value })} aria-label={`Track ${i + 1} duration`} placeholder="3:45" maxLength={10} className={input} />
                  <button type="button" onClick={() => removeTrack(i)} aria-label={`Remove track ${i + 1}`} className="text-ink-500 hover:text-danger">
                    <X className="size-4" />
                  </button>
                </Fragment>
              )
            })}
          </div>
          <button type="button" onClick={addTrack} className="inline-flex items-center gap-1 text-sm text-ink-300 hover:text-ink-100">
            <Plus className="size-4" /> Add track
          </button>
        </div>
        <Field label="Notes">
          <textarea value={f.notes} onChange={set('notes')} rows={2} maxLength={2000} className={input} />
        </Field>

        <div className="flex items-center justify-between pt-1">
          {onBack ? (
            <button type="button" onClick={onBack} className="text-sm text-ink-300 hover:text-ink-100">
              ← Back to search
            </button>
          ) : (
            <button type="button" onClick={onClose} className="text-sm text-ink-300 hover:text-ink-100">
              Cancel
            </button>
          )}
          <button disabled={saving} className="flex items-center gap-2 rounded-md bg-wax px-4 py-2 text-sm font-medium text-on-wax hover:bg-wax-hover disabled:opacity-60">
            {saving && <Loader2 className="size-4 animate-spin" />}
            {editing ? 'Save changes' : target === 'wishlist' ? 'Add to wishlist' : 'Add to collection'}
          </button>
        </div>
      </form>
    </div>
  )
}
