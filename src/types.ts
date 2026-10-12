import type { MissionState } from '../shared/mission'
export type Screen =
  | 'auth'
  | 'home'
  | 'worlds'
  | 'missions'
  | 'briefing'
  | 'dashboard'
  | 'profile'
  | 'leaderboard'
  | 'admin'
  | 'game'
  | 'event'
  | 'results'
  | 'pause'
export interface WorldInfo {
  name: string
  icon: string
  gradient: string
  specialty: string
  level: number
}
export interface Skin {
  name: string
  coat: number
  accent: number
  shopId: string | null
}
/** Local, per-device UI preferences only. XP / coins / progress live on the server. */
export interface Profile {
  skin: number
  muted: boolean
  padOn: boolean
}
export interface HudState {
  state: MissionState
  hp: number
  maxHp: number
  score: number
  dist: number
  pills: number
  target: number
  time: number
  timeLimit: number
  streak: number
  shield: boolean
  mult: number
  count: number | null
}
