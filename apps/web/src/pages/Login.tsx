import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { Logo } from '../Layout'

export default function Login() {
  const { user, loading, login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Navigate to="/" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setBusy(false)
    }
  }

  const input =
    'w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm outline-none transition-colors focus:border-wax'

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-xl border border-ink-800 bg-ink-900/60 p-8">
        <div className="flex justify-center pb-2">
          <Logo />
        </div>
        <label className="block space-y-1.5 text-sm text-ink-300">
          Email
          <input className={input} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block space-y-1.5 text-sm text-ink-300">
          Password
          <input className={input} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          disabled={busy}
          className="w-full rounded-md bg-wax px-3 py-2 text-sm font-medium text-ink-950 transition-colors hover:bg-wax-hover disabled:opacity-60"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-center text-xs text-ink-500">Accounts are created by your admin.</p>
      </form>
    </div>
  )
}
