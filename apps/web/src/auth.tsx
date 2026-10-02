import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError, type User } from './api'
import { useToast } from './notify'

interface AuthState {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setCurrency: (currency: string) => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  const refresh = useCallback(async () => {
    try {
      setUser((await api<{ user: User }>('/auth/me')).user)
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 401) console.error(err)
      setUser(null)
    }
  }, [])

  useEffect(() => {
    void refresh().finally(() => setLoading(false))
  }, [refresh])

  const login = useCallback(
    async (email: string, password: string) => {
      await api('/auth/login', { method: 'POST', json: { email, password } })
      await refresh()
    },
    [refresh],
  )

  useEffect(() => {
    const onUnauthorized = () => setUser(null)
    window.addEventListener('cratelog:unauthorized', onUnauthorized)
    return () => window.removeEventListener('cratelog:unauthorized', onUnauthorized)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not sign out')
      return
    }
    setUser(null)
    toast.info('Signed out')
  }, [toast])

  const setCurrency = useCallback(
    async (currency: string) => {
      try {
        await api('/auth/me', { method: 'PATCH', json: { currency } })
        await refresh()
        toast.success(`Prices will now be shown in ${currency}`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not change the currency')
      }
    },
    [refresh, toast],
  )

  return <AuthContext.Provider value={{ user, loading, login, logout, setCurrency, refresh }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
