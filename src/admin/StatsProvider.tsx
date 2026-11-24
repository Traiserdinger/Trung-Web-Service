import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getStats, type Stats } from './adminApi.ts'
import { useFail } from './session.ts'
import { StatsContext } from './statsContext.ts'

export function StatsProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  const fail = useFail(setError)

  useEffect(() => {
    let alive = true
    getStats()
      .then((s) => {
        if (!alive) return
        setStats(s)
        setError('')
      })
      .catch((e: unknown) => alive && fail(e))
    return () => {
      alive = false
    }
  }, [tick, fail])

  const refresh = useCallback(() => setTick((t) => t + 1), [])
  const value = useMemo(() => ({ stats, error, refresh }), [stats, error, refresh])
  return <StatsContext.Provider value={value}>{children}</StatsContext.Provider>
}
