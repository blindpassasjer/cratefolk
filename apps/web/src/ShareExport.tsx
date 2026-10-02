import { Check, Copy, FileSpreadsheet, Link2, Share2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import { useDialog, useToast } from './notify'

type Kind = 'all' | 'group' | 'wishlist' | 'forsale'

/** Popover with Excel export and a public read-only share link for the current view. */
export default function ShareExport({ kind, collectionId, exportHref }: { kind: Kind; collectionId?: number; exportHref: string }) {
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState<string | null | undefined>(undefined) // undefined = not loaded yet
  const [copied, setCopied] = useState(false)
  const toast = useToast()
  const { confirm } = useDialog()
  const ref = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  const noun = kind === 'wishlist' ? 'wishlist' : kind === 'group' ? 'crate' : kind === 'forsale' ? 'for-sale list' : 'library'
  const target = { kind, ...(collectionId ? { collectionId } : {}) }
  const url = token ? `${window.location.origin}/s/${token}` : ''

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

  useEffect(() => {
    if (!open || token !== undefined) return
    const qs = new URLSearchParams({ kind, ...(collectionId ? { collection: String(collectionId) } : {}) })
    api<{ share: { token: string } | null }>(`/shares?${qs}`)
      .then((r) => setToken(r.share?.token ?? null))
      .catch((e: Error) => {
        toast.error(e.message)
        setToken(null)
      })
  }, [open, token, kind, collectionId, toast])

  async function create() {
    try {
      setToken((await api<{ share: { token: string } }>('/shares', { method: 'POST', json: target })).share.token)
      toast.success('Share link created')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the link')
    }
  }

  async function stop() {
    if (!token) return
    const ok = await confirm({
      title: 'Stop sharing?',
      message: `Anyone with the current link will lose access to this ${noun}.`,
      confirmLabel: 'Stop sharing',
      danger: true,
    })
    if (!ok) return
    try {
      await api(`/shares/${token}`, { method: 'DELETE' })
      setToken(null)
      toast.success('Sharing stopped. The old link no longer works.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not stop sharing')
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      input.current?.select() // clipboard API needs HTTPS; fall back to manual copy
      toast.info('Press Ctrl/Cmd+C to copy the selected link')
      return
    }
    toast.success('Link copied to clipboard')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md border border-ink-700 px-3 py-2 text-sm text-ink-300 hover:border-ink-500 hover:text-ink-100"
      >
        <Share2 className="size-4" /> Share
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-80 space-y-4 rounded-xl border border-ink-700 bg-ink-900 p-4 text-sm shadow-xl">
          <section className="space-y-2">
            <h3 className="font-medium">Export</h3>
            <a href={exportHref} download className="flex items-center gap-2 rounded-md border border-ink-700 px-3 py-2 hover:border-wax">
              <FileSpreadsheet className="size-4 text-wax" /> Download as Excel (.xlsx)
            </a>
          </section>

          <section className="space-y-2 border-t border-ink-800 pt-4">
            <h3 className="flex items-center gap-1.5 font-medium">
              <Link2 className="size-4" /> Share link
            </h3>
            {token === undefined && <p className="text-xs text-ink-500">Loading…</p>}
            {token === null && (
              <>
                <p className="text-xs text-ink-500">
                  {kind === 'forsale'
                    ? 'Anyone with the link can view the copies you have for sale, with their grades and asking prices. Your notes stay private.'
                    : `Anyone with the link can view this ${noun}, read-only. Your notes, grades and prices stay private.`}
                </p>
                <button onClick={() => void create()} className="w-full rounded-md bg-wax px-3 py-2 font-medium text-on-wax hover:bg-wax-hover">
                  Create link
                </button>
              </>
            )}
            {token && (
              <>
                <div className="flex gap-2">
                  <input
                    ref={input}
                    readOnly
                    value={url}
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 rounded-md border border-ink-700 bg-ink-950 px-2 py-1.5 text-xs outline-none focus:border-wax"
                  />
                  <button onClick={() => void copy()} aria-label="Copy link" className="flex items-center gap-1 rounded-md border border-ink-700 px-2.5 hover:border-wax">
                    {copied ? <Check className="size-4 text-wax" /> : <Copy className="size-4" />}
                  </button>
                </div>
                <button onClick={() => void stop()} className="text-xs text-ink-500 hover:text-danger">
                  Stop sharing
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
