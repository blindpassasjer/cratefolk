import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, type CollectionGroup, type CollectionTotals } from './api'

interface CratesState {
  groups: CollectionGroup[]
  totals: CollectionTotals | null
  /** Reloads the crates and the record counts. Call it after anything that adds, removes or moves records. */
  refresh: () => Promise<void>
  /** Opens the rename/delete dialog. */
  manage: () => void
  managing: boolean
  closeManage: () => void
}

const CratesContext = createContext<CratesState | null>(null)

/** The user's crates and record counts, shared by the sidebar and the Collection page. */
export function CratesProvider({ children }: { children: ReactNode }) {
  const [groups, setGroups] = useState<CollectionGroup[]>([])
  const [totals, setTotals] = useState<CollectionTotals | null>(null)
  const [managing, setManaging] = useState(false)

  const refresh = useCallback(async () => {
    const r = await api<{ collections: CollectionGroup[]; totals: CollectionTotals }>('/collections')
    setGroups(r.collections)
    setTotals(r.totals)
  }, [])

  useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  const value = useMemo(
    () => ({ groups, totals, refresh, manage: () => setManaging(true), managing, closeManage: () => setManaging(false) }),
    [groups, totals, refresh, managing],
  )
  return <CratesContext.Provider value={value}>{children}</CratesContext.Provider>
}

export function useCrates(): CratesState {
  const ctx = useContext(CratesContext)
  if (!ctx) throw new Error('useCrates outside CratesProvider')
  return ctx
}
