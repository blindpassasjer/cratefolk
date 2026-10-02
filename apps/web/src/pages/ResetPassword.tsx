import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { Logo } from '../Logo'
import { useToast } from '../notify'
import { ThemeToggle } from '../theme'

const input = 'w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm outline-none transition-colors focus:border-wax'

/** Public page opened from a reset link the admin gave out. */
export default function ResetPassword() {
  const { token } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [who, setWho] = useState<{ name: string; email: string } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<{ name: string; email: string }>(`/auth/reset/${token}`)
      .then(setWho)
      .catch((e: Error) => setProblem(e.message))
  }, [token])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password !== repeat) return toast.error("The passwords don't match")
    setBusy(true)
    try {
      await api('/auth/reset', { method: 'POST', json: { token, password } })
      toast.success('Password changed. Sign in with your new password.')
      navigate('/login', { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reset the password')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="fixed right-3 top-3">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm space-y-5 rounded-xl border border-ink-800 bg-ink-900/60 p-8">
        <div className="flex justify-center pb-2">
          <Logo />
        </div>
        {problem && (
          <>
            <p className="text-center text-sm text-danger">{problem}</p>
            <Link to="/login" className="block text-center text-sm text-wax hover:underline">Back to sign in</Link>
          </>
        )}
        {who && (
          <form onSubmit={submit} className="space-y-5">
            <p className="text-center text-sm text-ink-300">
              Choose a new password for <span className="font-medium text-ink-100">{who.email}</span>.
            </p>
            <label className="block space-y-1.5 text-sm text-ink-300">
              New password (8+ characters)
              <input className={input} type="password" required minLength={8} autoFocus autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <label className="block space-y-1.5 text-sm text-ink-300">
              Repeat new password
              <input className={input} type="password" required minLength={8} autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
            </label>
            <button disabled={busy} className="w-full rounded-md bg-wax px-3 py-2 text-sm font-medium text-on-wax transition-colors hover:bg-wax-hover disabled:opacity-60">
              {busy ? 'Saving…' : 'Set new password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
