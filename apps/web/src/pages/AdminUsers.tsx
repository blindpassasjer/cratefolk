import { Check, Copy } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { api, type AdminUser } from '../api'
import { useDialog, useToast } from '../notify'

const input =
  'rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm outline-none transition-colors focus:border-wax'

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const toast = useToast()
  const { confirm, prompt } = useDialog()
  const [loadError, setLoadError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [regOpen, setRegOpen] = useState<boolean | null>(null)
  const [link, setLink] = useState<{ email: string; url: string } | null>(null)

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

  async function resetPassword(u: AdminUser) {
    const password = await prompt({
      title: 'Reset password',
      message: `Choose a new password for ${u.email}. They will be signed out everywhere.`,
      label: 'New password (8+ characters)',
      type: 'password',
      confirmLabel: 'Reset password',
      validate: (v) => (v.length < 8 ? 'Use at least 8 characters' : null),
    })
    if (password) void run(() => api(`/admin/users/${u.id}`, { method: 'PATCH', json: { password } }), `Password reset for ${u.email}`)
  }

  async function createResetLink(u: AdminUser) {
    try {
      const { token } = await api<{ token: string }>(`/admin/users/${u.id}/reset-link`, { method: 'POST' })
      setLink({ email: u.email, url: `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/reset/${token}` })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create a reset link')
    }
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

  const action = 'text-ink-300 hover:text-ink-100'

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">Users</h2>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-ink-800 bg-ink-900/60 p-4">
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

      <form onSubmit={create} className="grid gap-3 rounded-xl border border-ink-800 bg-ink-900/60 p-4 sm:grid-cols-2">
        <input className={input} placeholder="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className={input} type="email" placeholder="Email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className={input} type="password" placeholder="Password (8+ chars)" minLength={8} required autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <button className="rounded-md bg-wax px-4 py-2 text-sm font-medium text-on-wax hover:bg-wax-hover sm:col-span-2">Create user</button>
      </form>
      </div>

      {loadError && <p className="text-sm text-danger">{loadError}</p>}

      <div className="overflow-x-auto rounded-xl border border-ink-800">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-ink-800 text-ink-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-ink-800 last:border-0">
                <td className="px-4 py-3">{u.name}</td>
                <td className="px-4 py-3 text-ink-300">{u.email}</td>
                <td className="px-4 py-3 text-ink-300">{u.role}</td>
                <td className="px-4 py-3 text-ink-300">{u.disabled ? 'Disabled' : 'Active'}</td>
                <td className="space-x-4 px-4 py-3 text-right">
                  {u.role !== 'admin' && (
                    <>
                      <button className={action} onClick={() => void createResetLink(u)}>Reset link</button>
                      <button className={action} onClick={() => void resetPassword(u)}>Set password</button>
                      <button
                        className={action}
                        onClick={() => void run(() => api(`/admin/users/${u.id}`, { method: 'PATCH', json: { disabled: !u.disabled } }), u.disabled ? `Enabled ${u.email}` : `Disabled ${u.email}`)}
                      >
                        {u.disabled ? 'Enable' : 'Disable'}
                      </button>
                      <button className="text-danger hover:text-danger" onClick={() => void remove(u)}>Delete</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {link && <ResetLinkDialog link={link} onClose={() => setLink(null)} />}
    </section>
  )
}

/** Shows a freshly made reset link once, for the admin to copy and send to the user. */
function ResetLinkDialog({ link, onClose }: { link: { email: string; url: string }; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  const toast = useToast()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function copy() {
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      field.current?.select() // clipboard API needs HTTPS; fall back to manual copy
      toast.info('Press Ctrl/Cmd+C to copy the selected link')
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Password reset link" className="w-full max-w-md space-y-4 rounded-xl border border-ink-700 bg-ink-900 p-5 shadow-2xl">
        <div className="space-y-1.5">
          <h2 className="font-semibold">Reset link for {link.email}</h2>
          <p className="text-sm text-ink-300">Send them this link. It works once and expires in 24 hours. Creating a new link replaces this one, and you can't view it again after closing.</p>
        </div>
        <div className="flex gap-2">
          <input ref={field} readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-md border border-ink-700 bg-ink-950 px-2 py-1.5 text-xs outline-none focus:border-wax" />
          <button onClick={() => void copy()} aria-label="Copy link" className="flex items-center gap-1 rounded-md border border-ink-700 px-2.5 hover:border-wax">
            {copied ? <Check className="size-4 text-wax" /> : <Copy className="size-4" />}
          </button>
        </div>
        <div className="flex justify-end">
          <button onClick={onClose} className="rounded-md border border-ink-700 px-4 py-2 text-sm hover:border-ink-500">Done</button>
        </div>
      </div>
    </div>
  )
}
