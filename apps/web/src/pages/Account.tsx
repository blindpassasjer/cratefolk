import { useState, type FormEvent, type ReactNode } from 'react'
import { api, CURRENCIES } from '../api'
import { useAuth } from '../auth'
import { useToast } from '../notify'
import AdminUsers from './AdminUsers'

const input =
  'w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm outline-none transition-colors focus:border-wax disabled:opacity-60'
const button =
  'rounded-md bg-wax px-4 py-2 text-sm font-medium text-on-wax transition-colors hover:bg-wax-hover disabled:opacity-60'

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-ink-800 bg-ink-900/60 p-5">
      <div>
        <h2 className="font-medium">{title}</h2>
        {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm text-ink-300">
      {label}
      {children}
    </label>
  )
}

export default function Account() {
  const { user, refresh, setCurrency } = useAuth()
  const toast = useToast()
  const isAdmin = user?.role === 'admin'

  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [emailPassword, setEmailPassword] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  const emailChanged = !!user && email.trim().toLowerCase() !== user.email

  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    setSavingProfile(true)
    try {
      await api('/auth/me', {
        method: 'PATCH',
        json: { name, ...(emailChanged ? { email: email.trim(), currentPassword: emailPassword } : {}) },
      })
      await refresh()
      setEmailPassword('')
      toast.success(emailChanged ? 'Profile saved. Use your new email next time you sign in.' : 'Profile saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save your profile')
    } finally {
      setSavingProfile(false)
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault()
    if (next !== confirm) return toast.error("The new passwords don't match")
    setSavingPassword(true)
    try {
      await api('/auth/password', { method: 'POST', json: { currentPassword: current, newPassword: next } })
      setCurrent('')
      setNext('')
      setConfirm('')
      toast.success('Password changed. Your other devices have been signed out.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change your password')
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="space-y-10">
      <div className="mx-auto max-w-xl space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>

        <Card title="Profile" hint={isAdmin ? 'The admin email is set with ADMIN_EMAIL in your environment, so only the name can be changed here.' : undefined}>
          <form onSubmit={saveProfile} className="space-y-4">
            <Field label="Name">
              <input className={input} required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Email address">
              <input className={input} type="email" required disabled={isAdmin} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            {emailChanged && (
              <Field label="Current password (needed to change your email)">
                <input className={input} type="password" required autoComplete="current-password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} />
              </Field>
            )}
            <div className="flex items-center gap-4">
              <button className={button} disabled={savingProfile}>
                {savingProfile ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </Card>

        <Card title="Password" hint={isAdmin ? 'The admin password is set with ADMIN_PASSWORD in your environment. Change it there and restart.' : 'Changing it signs you out of your other devices.'}>
          {!isAdmin && (
            <form onSubmit={savePassword} className="space-y-4">
              <Field label="Current password">
                <input className={input} type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
              </Field>
              <Field label="New password (8+ characters)">
                <input className={input} type="password" required minLength={8} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
              </Field>
              <Field label="Repeat new password">
                <input className={input} type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </Field>
              <div className="flex items-center gap-4">
                <button className={button} disabled={savingPassword}>
                  {savingPassword ? 'Changing…' : 'Change password'}
                </button>
              </div>
            </form>
          )}
        </Card>

        <Card title="Preferences" hint="Marketplace prices on your wishlist are shown in this currency.">
          <Field label="Currency">
            <select className={input} value={user?.currency ?? 'USD'} onChange={(e) => void setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </Card>
      </div>
      {isAdmin && <AdminUsers />}
    </div>
  )
}
