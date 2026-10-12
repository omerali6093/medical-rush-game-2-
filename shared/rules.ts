/**
 * Game rules shared by the React client (live preview) and the Express server (authoritative).
 * The server NEVER trusts client-reported score/xp/coins: it recomputes them from validated aggregates with these functions.
 */
export const XP_PER_LEVEL = 500
export const levelOfXp = (xp: number) => 1 + Math.floor(xp / XP_PER_LEVEL)

export const DAMAGE = 20 // health lost per damaging hit
export const QUIZ_HEAL = 20 // health gained for a correct quiz answer
export const QUIZ_PENALTY = 10 // health lost for a wrong / timed-out answer (never kills)
export const MAX_SPEED = 32 // m/s, engine speed cap
export const MAX_PILLS_PER_SEC = 8
export const QUIZ_ALLOWANCE = 30 // wall-clock seconds allowed per quiz pause
export const QUIZ_CLOCK_TOLERANCE = 5

export const maxDistanceFor = (activeSec: number) =>
  Math.ceil(activeSec * MAX_SPEED) + 20
export const maxPillsFor = (distance: number) =>
  Math.ceil(distance / 10) * 4 + 4
export const maxHitsFor = (distance: number) => Math.ceil(distance / 10) * 2 + 2
/** Overall session deadline (active timer pauses during quizzes, but the wall clock never does). */
export const maxWallSeconds = (timeLimit: number, quizCount: number) =>
  timeLimit + quizCount * QUIZ_ALLOWANCE + 45

export interface RunStats {
  activeSeconds: number
  distance: number
  pills: number
  bonusPoints: number
  collisions: number
  brandedPills: number
  quizCorrect: number
  quizWrong: number
}

/** Official score. Everything here is either server-validated or server-recorded (quiz attempts). */
export function computeScore (
  s: RunStats,
  won: boolean,
  timeLimit: number
): number {
  const bonus = Math.min(Math.max(0, s.bonusPoints), s.pills * 50)
  const timeBonus = won
    ? Math.max(0, Math.floor(timeLimit - s.activeSeconds)) * 5
    : 0
  const clean = won && s.collisions === 0 ? 300 : 0
  return Math.max(
    0,
    Math.floor(s.distance) +
      s.pills * 10 +
      bonus +
      s.quizCorrect * 150 +
      timeBonus +
      clean -
      s.collisions * 25
  )
}

/** 0 = lost, 1 = won, +1 for quiz accuracy >= 2/3, +1 for finishing with >= 25% of the time left. */
export function starsFor (s: RunStats, won: boolean, timeLimit: number): number {
  if (!won) return 0
  const n = s.quizCorrect + s.quizWrong
  return (
    1 +
    (n > 0 && s.quizCorrect / n >= 2 / 3 ? 1 : 0) +
    (timeLimit - s.activeSeconds >= timeLimit * 0.25 ? 1 : 0)
  )
}

export interface RewardCfg {
  xp: number
  coins: number
  quizXp: number
  maxXp: number
  maxCoins: number
}
/** `repeat` = the player already completed this mission before (reduced rewards to prevent farming). */
export function computeRewards (
  cfg: RewardCfg,
  s: RunStats,
  won: boolean,
  stars: number,
  repeat: boolean
) {
  const f = repeat ? 0.5 : 1
  const xp = Math.min(
    cfg.maxXp,
    Math.floor(
      ((won ? cfg.xp : 0) +
        s.quizCorrect * cfg.quizXp +
        Math.floor(s.pills * 0.5)) *
        f
    )
  )
  const coins = Math.min(
    cfg.maxCoins,
    Math.floor(
      ((won ? cfg.coins : 0) +
        Math.floor(s.pills / 5) +
        (stars >= 3 ? 10 : 0)) *
        f
    )
  )
  return { xp, coins }
}

export const ACHIEVEMENTS = [
  { key: 'first_win', title: 'First Dose', desc: 'Win your first mission' },
  {
    key: 'sharp_mind',
    title: 'Sharp Mind',
    desc: 'Answer every quiz correctly in a winning run'
  },
  {
    key: 'untouchable',
    title: 'Untouchable',
    desc: 'Win a mission without taking damage'
  },
  {
    key: 'collector_100',
    title: 'Collector',
    desc: 'Collect 100 medicines in total'
  },
  { key: 'level_5', title: 'Rising Star', desc: 'Reach player level 5' },
  {
    key: 'three_stars',
    title: 'Perfect Run',
    desc: 'Earn 3 stars on a mission'
  }
] as const

export const SHOP = [
  { id: 'skin_surgeon', name: 'Surgeon scrubs', price: 150, skin: 1 },
  { id: 'skin_paramedic', name: 'Paramedic jacket', price: 300, skin: 2 }
] as const

export const RANK_RULES = [
  'Mission completed (win) ranks above any non-win',
  'More correct quiz answers',
  'Won runs: faster active time; non-wins: more medicines collected',
  'Fewer collisions',
  'Higher official score',
  'Earlier validated finish time',
  'Player ID (final deterministic tie-breaker)'
]
