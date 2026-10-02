import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, type AdminUser } from '../api'

const input =
  'rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm outline-none transition-colors focus:border-wax'

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', email: '', password: '' })

  const load = useCallback(async () => {
    setUsers((await api<{ users: AdminUser[] }>('/admin/users')).users)
  }, [])

  useEffect(() => {
    load().catch((e: Error) => setError(e.message))
  }, [load])

  async function run(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  function create(e: FormEvent) {
    e.preventDefault()
    void run(async () => {
      await api('/admin/users', { method: 'POST', json: form })
      setForm({ name: '', email: '', password: '' })
    })
  }

  function resetPassword(u: AdminUser) {
    const password = window.prompt(`New password for ${u.email} (min 8 characters)`)
    if (password) void run(() => api(`/admin/users/${u.id}`, { method: 'PATCH', json: { password } }))
  }

  function remove(u: AdminUser) {
    if (window.confirm(`Delete ${u.email} and all of their data?`)) {
      void run(() => api(`/admin/users/${u.id}`, { method: 'DELETE' }))
    }
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

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-ink-800">
        <table className="w-full text-left text-sm">
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
                      <button className={action} onClick={() => resetPassword(u)}>Reset password</button>
                      <button
                        className={action}
                        onClick={() => void run(() => api(`/admin/users/${u.id}`, { method: 'PATCH', json: { disabled: !u.disabled } }))}
                      >
                        {u.disabled ? 'Enable' : 'Disable'}
                      </button>
                      <button className="text-danger hover:text-danger" onClick={() => remove(u)}>Delete</button>
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
