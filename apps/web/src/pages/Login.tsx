import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { IS_DEMO } from '../api'
import { useAuth } from '../auth'
import { Logo } from '../Layout'
import { useToast } from '../notify'
import { ThemeToggle } from '../theme'

export default function Login() {
  const { user, loading, login } = useAuth()
  const [email, setEmail] = useState(IS_DEMO ? 'demo@waxcrate.app' : '')
  const [password, setPassword] = useState(IS_DEMO ? 'demo' : '')
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Navigate to="/" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await login(email, password)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setBusy(false)
    }
  }

  const input =
    'w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm outline-none transition-colors focus:border-wax'

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="fixed right-3 top-3">
        <ThemeToggle />
      </div>
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
        <button
          disabled={busy}
          className="w-full rounded-md bg-wax px-3 py-2 text-sm font-medium text-on-wax transition-colors hover:bg-wax-hover disabled:opacity-60"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-center text-xs text-ink-500">
          {IS_DEMO ? 'This is a demo: any email and password works.' : 'Accounts are created by your admin. Forgot your password? Ask them for a reset link.'}
        </p>
      </form>
    </div>
  )
}
