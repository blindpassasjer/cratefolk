import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError, type User } from './api'

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

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' })
    setUser(null)
  }, [])

  const setCurrency = useCallback(
    async (currency: string) => {
      await api('/auth/me', { method: 'PATCH', json: { currency } })
      await refresh()
    },
    [refresh],
  )

  return <AuthContext.Provider value={{ user, loading, login, logout, setCurrency, refresh }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
