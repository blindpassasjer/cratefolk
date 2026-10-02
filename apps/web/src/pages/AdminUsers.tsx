import { useCallback, useEffect, useState, type FormEvent } from 'react'
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

  const load = useCallback(async () => {
    setUsers((await api<{ users: AdminUser[] }>('/admin/users')).users)
  }, [])

  useEffect(() => {
    load().catch((e: Error) => setLoadError(e.message))
  }, [load])

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
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Users</h1>

      <form onSubmit={create} className="grid gap-3 rounded-xl border border-ink-800 bg-ink-900/60 p-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <input className={input} placeholder="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className={input} type="email" placeholder="Email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className={input} type="password" placeholder="Password (8+ chars)" minLength={8} required autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <button className="rounded-md bg-wax px-4 py-2 text-sm font-medium text-on-wax hover:bg-wax-hover">Create user</button>
      </form>

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
                      <button className={action} onClick={() => void resetPassword(u)}>Reset password</button>
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
    </div>
  )
}
