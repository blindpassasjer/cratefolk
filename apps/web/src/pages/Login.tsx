import { useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { api, IS_DEMO } from '../api'
import { useAuth } from '../auth'
import { RecordBackdrop } from '../Art'
import { Logo } from '../Logo'
import { useToast } from '../notify'
import { ThemeToggle } from '../theme'

export default function Login() {
  const { user, loading, login, refresh } = useAuth()
  const [email, setEmail] = useState(IS_DEMO ? 'demo@example.com' : '')
  const [password, setPassword] = useState(IS_DEMO ? 'demo' : '')
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [regOpen, setRegOpen] = useState(false)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')

  useEffect(() => {
    api<{ open: boolean }>('/auth/registration-status')
      .then((s) => setRegOpen(s.open))
      .catch(() => {})
  }, [])

  if (!loading && user) return <Navigate to="/" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      if (mode === 'register') {
        await api('/auth/register', { method: 'POST', json: { name, email, password } })
        await refresh()
      } else {
        await login(email, password)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : mode === 'register' ? 'Could not create the account' : 'Sign in failed')
    } finally {
      setBusy(false)
    }
  }

  const input =
    'w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm outline-none transition-colors focus:border-wax'

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <RecordBackdrop />
      <div className="fixed right-3 top-3 z-10">
        <ThemeToggle />
      </div>
      <form onSubmit={submit} className="relative w-full max-w-sm space-y-5 rounded-xl border border-ink-800 bg-ink-900 p-8">
        <div className="flex justify-center pb-2">
          <Logo />
        </div>
        {mode === 'register' && (
          <label className="block space-y-1.5 text-sm text-ink-300">
            Name
            <input className={input} required maxLength={80} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        <label className="block space-y-1.5 text-sm text-ink-300">
          Email
          <input className={input} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block space-y-1.5 text-sm text-ink-300">
          Password
          <input className={input} type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={mode === 'register' ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button
          disabled={busy}
          className="w-full rounded-md bg-wax px-3 py-2 text-sm font-medium text-on-wax transition-colors hover:bg-wax-hover disabled:opacity-60"
        >
          {mode === 'register' ? (busy ? 'Creating account…' : 'Create account') : busy ? 'Signing in…' : 'Sign in'}
        </button>
        {regOpen && (
          <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')} className="block w-full text-center text-sm text-ink-300 hover:text-ink-100">
            {mode === 'login' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
          </button>
        )}
        <p className="text-center text-xs text-ink-500">
          {IS_DEMO ? 'This is a demo: any email and password works.' : (regOpen ? 'Create an account, or ask your admin for one. Forgot' : 'Accounts are created by your admin. Forgot your password? Ask them for a reset link.')}
        </p>
      </form>
    </div>
  )
}
