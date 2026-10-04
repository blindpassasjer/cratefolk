import { Check, Copy, MoreHorizontal } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { api, type AdminUser } from '../api'
import { useDialog, useToast } from '../notify'

const input =
  'rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm outline-none transition-colors focus:border-wax'

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const toast = useToast()
  const { confirm } = useDialog()
  const [loadError, setLoadError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [regOpen, setRegOpen] = useState<boolean | null>(null)
  const [resetFor, setResetFor] = useState<AdminUser | null>(null)
  const [menu, setMenu] = useState<number | null>(null)

  const load = useCallback(async () => {
    setUsers((await api<{ users: AdminUser[] }>('/admin/users')).users)
  }, [])

  useEffect(() => {
    load().catch((e: Error) => setLoadError(e.message))
    api<{ registrationOpen: boolean }>('/admin/settings')
      .then((s) => setRegOpen(s.registrationOpen))
      .catch(() => {})
  }, [load])

  async function toggleRegistration() {
    try {
      const s = await api<{ registrationOpen: boolean }>('/admin/settings', { method: 'PATCH', json: { registrationOpen: !regOpen } })
      setRegOpen(s.registrationOpen)
      toast.success(s.registrationOpen ? 'Registration is open' : 'Registration is closed')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update registration')
    }
  }

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action()
      await load()
      toast.success(success)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  function create(e: FormEvent) {
    e.preventDefault()
    void run(async () => {
      await api('/admin/users', { method: 'POST', json: form })
      setForm({ name: '', email: '', password: '' })
    }, `Created an account for ${form.email}`)
  }

  async function remove(u: AdminUser) {
    const ok = await confirm({
      title: 'Delete this user?',
      message: `${u.email} and all of their records, wishlist, crates and share links will be permanently deleted.`,
      confirmLabel: 'Delete user',
      danger: true,
    })
    if (ok) void run(() => api(`/admin/users/${u.id}`, { method: 'DELETE' }), `Deleted ${u.email}`)
  }

  const item = 'block w-full px-3 py-2 text-left text-ink-300 hover:bg-ink-800 hover:text-ink-100'

  return (
    <section className="mb-6 break-inside-avoid space-y-5 rounded-xl border border-ink-800 bg-ink-900/60 p-5">
      <h2 className="font-medium">Users</h2>

      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <h3 className="text-sm font-medium">Registration</h3>
          <p className="text-sm text-ink-300">
            {regOpen ? 'Open: anyone can create an account from the sign-in page.' : 'Closed: only you can create accounts.'}
          </p>
        </div>
        <button
          role="switch"
          aria-checked={!!regOpen}
          aria-label="Allow registration"
          disabled={regOpen === null}
          onClick={() => void toggleRegistration()}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${regOpen ? 'bg-wax' : 'bg-ink-700'}`}
        >
          <span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white transition-transform ${regOpen ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      <form onSubmit={create} className="space-y-3 border-t border-ink-800 pt-5">
        <h3 className="text-sm font-medium">New user</h3>
        <input className={`${input} w-full`} placeholder="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className={`${input} w-full`} type="email" placeholder="Email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className={`${input} w-full`} type="password" placeholder="Password (8+ chars)" minLength={8} required autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <button className="rounded-md bg-wax px-4 py-2 text-sm font-medium text-on-wax hover:bg-wax-hover">Create user</button>
      </form>

      {loadError && <p className="text-sm text-danger">{loadError}</p>}

      <ul className="-mx-5 divide-y divide-ink-800 border-t border-ink-800">
        {users.map((u) => (
          <li key={u.id} className="flex items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm">
                <span className={`truncate ${u.disabled ? 'text-ink-500' : ''}`}>{u.name}</span>
                {u.role === 'admin' && <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-300">Admin</span>}
                {u.disabled && <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-500">Disabled</span>}
              </div>
              <div className="truncate text-xs text-ink-500">{u.email}</div>
            </div>
            {u.role !== 'admin' && (
              <div className="relative">
                <button
                  aria-label={`Actions for ${u.email}`}
                  aria-haspopup="menu"
                  aria-expanded={menu === u.id}
                  onClick={() => setMenu(menu === u.id ? null : u.id)}
                  className="rounded-md p-1.5 text-ink-300 hover:bg-ink-800 hover:text-ink-100"
                >
                  <MoreHorizontal className="size-4" />
                </button>
                {menu === u.id && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />
                    <div role="menu" className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-ink-700 bg-ink-900 py-1 text-sm shadow-xl" onClick={() => setMenu(null)}>
                      <button role="menuitem" className={item} onClick={() => setResetFor(u)}>Reset password…</button>
                      <button
                        role="menuitem"
                        className={item}
                        onClick={() => void run(() => api(`/admin/users/${u.id}`, { method: 'PATCH', json: { disabled: !u.disabled } }), u.disabled ? `Enabled ${u.email}` : `Disabled ${u.email}`)}
                      >
                        {u.disabled ? 'Enable account' : 'Disable account'}
                      </button>
                      <button role="menuitem" className={`${item} text-danger hover:text-danger`} onClick={() => void remove(u)}>Delete…</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {resetFor && <ResetPasswordDialog user={resetFor} onClose={() => setResetFor(null)} />}
    </section>
  )
}

/** One place to get a user back in: set a password now, or make a one-time link for them to choose their own. */
function ResetPasswordDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  const toast = useToast()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function setNew(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await api(`/admin/users/${user.id}`, { method: 'PATCH', json: { password } })
      toast.success(`Password reset for ${user.email}`)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reset the password')
      setSaving(false)
    }
  }

  async function makeLink() {
    try {
      const { token } = await api<{ token: string }>(`/admin/users/${user.id}/reset-link`, { method: 'POST' })
      setUrl(`${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/reset/${token}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create a reset link')
    }
  }

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      field.current?.select() // clipboard API needs HTTPS; fall back to manual copy
      toast.info('Press Ctrl/Cmd+C to copy the selected link')
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Reset password" className="w-full max-w-md space-y-5 rounded-xl border border-ink-700 bg-ink-900 p-5 shadow-2xl">
        <div className="space-y-1">
          <h2 className="font-semibold">Reset password</h2>
          <p className="truncate text-sm text-ink-300">{user.email}</p>
        </div>

        <form onSubmit={setNew} className="space-y-2">
          <label className="block space-y-1.5 text-sm text-ink-300">
            Set a new password
            <input className={`${input} w-full`} type="password" minLength={8} required autoComplete="new-password" placeholder="8+ characters" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <p className="text-xs text-ink-500">They will be signed out everywhere.</p>
          <button disabled={saving} className="rounded-md bg-wax px-4 py-2 text-sm font-medium text-on-wax hover:bg-wax-hover disabled:opacity-60">Set password</button>
        </form>

        <div className="space-y-2 border-t border-ink-800 pt-4">
          <p className="text-sm text-ink-300">Or let them choose their own</p>
          {url ? (
            <>
              <div className="flex gap-2">
                <input ref={field} readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-md border border-ink-700 bg-ink-950 px-2 py-1.5 text-xs outline-none focus:border-wax" />
                <button onClick={() => void copy()} aria-label="Copy link" className="flex items-center rounded-md border border-ink-700 px-2.5 hover:border-wax">
                  {copied ? <Check className="size-4 text-wax" /> : <Copy className="size-4" />}
                </button>
              </div>
              <p className="text-xs text-ink-500">Works once and expires in 24 hours. Making a new link replaces this one, and you can't view it again after closing.</p>
            </>
          ) : (
            <button onClick={() => void makeLink()} className="rounded-md border border-ink-700 px-4 py-2 text-sm hover:border-ink-500">Create one-time link</button>
          )}
        </div>

        <div className="flex justify-end">
          <button onClick={onClose} className="rounded-md border border-ink-700 px-4 py-2 text-sm hover:border-ink-500">Done</button>
        </div>
      </div>
    </div>
  )
}
