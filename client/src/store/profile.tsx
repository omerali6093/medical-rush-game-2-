import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from 'react'
import type { Profile } from '../types'
import { audio } from '../engine/audio'

const KEY = 'pharma-rush-profile'
const DEFAULT: Profile = { skin: 0, muted: false, padOn: false }
const load = (): Profile => {
  try {
    return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return DEFAULT
  }
}

interface Ctx {
  profile: Profile
  patch: (p: Partial<Profile>) => void
}
const ProfileCtx = createContext<Ctx>({ profile: DEFAULT, patch: () => {} })

export function ProfileProvider ({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile>(load)
  const patch = useCallback(
    (p: Partial<Profile>) => setProfile(prev => ({ ...prev, ...p })),
    []
  )
  useEffect(() => {
    audio.muted = profile.muted
    try {
      localStorage.setItem(KEY, JSON.stringify(profile))
    } catch {
      /* ignore */
    }
  }, [profile])
  return (
    <ProfileCtx.Provider value={{ profile, patch }}>
      {children}
    </ProfileCtx.Provider>
  )
}
export const useProfile = () => useContext(ProfileCtx)
