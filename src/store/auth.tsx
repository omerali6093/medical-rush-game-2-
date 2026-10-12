import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from 'react'
import { api } from '../api/client'
import type { Progress, User } from '../api/types'

interface Ctx {
  user: User | null
  progress: Progress | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (b: {
    email: string
    password: string
    displayName: string
    profession: string
    acceptTerms: boolean
  }) => Promise<void>
  logout: () => Promise<void>
  setProgress: (p: Progress) => void
  refresh: () => Promise<void>
  setUser: (u: User) => void
}
const AuthCtx = createContext<Ctx>(null as unknown as Ctx)

/** Server is the source of truth for identity and progress (xp, coins, level, unlocks). Nothing here is persisted locally. */
export function AuthProvider ({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [loading, setLoading] = useState(true)
  const apply = (d: { user: User; progress: Progress }) => {
    setUser(d.user)
    setProgress(d.progress)
  }
  const refresh = useCallback(async () => {
    try {
      apply(await api('/auth/me'))
    } catch {
      setUser(null)
      setProgress(null)
    }
  }, [])
  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])
  const login = useCallback(
    async (email: string, password: string) =>
      apply(await api('/auth/login', { body: { email, password } })),
    []
  )
  const signup = useCallback(
    async (b: Parameters<Ctx['signup']>[0]) =>
      apply(await api('/auth/signup', { body: b })),
    []
  )
  const logout = useCallback(async () => {
    await api('/auth/logout', { body: {} }).catch(() => undefined)
    setUser(null)
    setProgress(null)
  }, [])
  return (
    <AuthCtx.Provider
      value={{
        user,
        progress,
        loading,
        login,
        signup,
        logout,
        setProgress,
        refresh,
        setUser
      }}
    >
      {children}
    </AuthCtx.Provider>
  )
}
export const useAuth = () => useContext(AuthCtx)
