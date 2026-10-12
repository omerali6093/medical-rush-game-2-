import {
  DAMAGE,
  QUIZ_HEAL,
  QUIZ_PENALTY,
  computeScore,
  type RunStats
} from './rules'

/**
 * Central mission state machine — the single owner of the timer, health, objective, quiz checkpoints and win/loss.
 * Framework-free (no React/Three) so the client, the 3D engine and the server tests all share the exact same rules.
 *
 *   READY -> RUNNING <-> QUIZ_PAUSED -> WON | LOST -> RESULTS
 *
 * Edge-case rules (published):
 *  - The active timer only advances in RUNNING; it is frozen while paused or in QUIZ_PAUSED.
 *  - Per frame: collisions/pickups are applied first, then resolve(). Health 0 beats objective-complete in the same frame (LOST).
 *  - Objective met before the deadline => WON immediately (no quiz) unless requireFinalQuiz.
 *  - Deadline reached with objective unmet => the final checkpoint quiz is shown, then the run is LOST (timeout).
 *  - Quiz answers never end the run by health: a wrong answer leaves at least 1 HP.
 */
export type MissionState =
  | 'READY'
  | 'RUNNING'
  | 'QUIZ_PAUSED'
  | 'WON'
  | 'LOST'
  | 'RESULTS'
export type LossReason = 'health' | 'timeout'
export interface MissionRules {
  timeLimit: number
  maxHealth: number
  target: number
  quizAt: number[]
  requireFinalQuiz: boolean
}
export interface RunSummary {
  outcome: 'won' | 'lost'
  reason: LossReason | null
  activeSeconds: number
  distance: number
  pills: number
  brandedPills: number
  bonusPoints: number
  collisions: number
  hpRemaining: number
  quizzesShown: number
}
export interface MachineHooks {
  onQuiz(index: number): void
  onEnd(s: RunSummary): void
  onChange?(): void
}

export class MissionMachine {
  state: MissionState = 'READY'
  activeTime = 0
  health: number
  distance = 0
  pills = 0
  brandedPills = 0
  bonusPoints = 0
  collisions = 0
  quizzesShown = 0
  quizCorrect = 0
  quizWrong = 0
  reason: LossReason | null = null
  private nextQuiz = 0
  private pending: 'WON' | 'LOST' | null = null
  private shown = new Set<number>()

  constructor (readonly rules: MissionRules, private hooks: MachineHooks) {
    this.health = rules.maxHealth
  }

  get remaining () {
    return Math.max(0, this.rules.timeLimit - this.activeTime)
  }
  private get finalIndex () {
    return this.rules.quizAt.findIndex(t => t >= this.rules.timeLimit)
  }

  start () {
    if (this.state !== 'READY') return false
    this.state = 'RUNNING'
    this.hooks.onChange?.()
    return true
  }
  advance (dt: number, distance: number) {
    if (this.state !== 'RUNNING') return
    this.activeTime = Math.min(this.rules.timeLimit, this.activeTime + dt)
    this.distance = distance
  }
  collect (n = 1, bonus = 0, branded = false) {
    if (this.state !== 'RUNNING') return
    this.pills += n
    this.bonusPoints += bonus
    if (branded) this.brandedPills += n
  }
  damage () {
    if (this.state !== 'RUNNING') return
    this.health = Math.max(0, this.health - DAMAGE)
    this.collisions++
  }

  /** Call once per frame after pickups/collisions. */
  resolve () {
    if (this.state !== 'RUNNING') return
    const r = this.rules
    if (this.health <= 0) return this.finish('LOST', 'health')
    if (this.pills >= r.target) {
      const f = this.finalIndex
      if (r.requireFinalQuiz && f >= 0 && !this.shown.has(f))
        return this.pause(f, 'WON')
      return this.finish('WON', null)
    }
    if (this.activeTime >= r.timeLimit) {
      const f = this.finalIndex
      if (f >= 0 && !this.shown.has(f)) return this.pause(f, 'LOST')
      return this.finish('LOST', 'timeout')
    }
    const t = r.quizAt[this.nextQuiz]
    if (t !== undefined && t < r.timeLimit && this.activeTime >= t)
      this.pause(this.nextQuiz, null)
  }

  /** Quiz answered on the server; resume the run (or finish if this was the final checkpoint). */
  quizAnswered (correct: boolean) {
    if (this.state !== 'QUIZ_PAUSED') return
    if (correct) {
      this.quizCorrect++
      this.health = Math.min(this.rules.maxHealth, this.health + QUIZ_HEAL)
    } else {
      this.quizWrong++
      this.health = Math.max(1, this.health - QUIZ_PENALTY)
    }
    const p = this.pending
    this.pending = null
    if (p) this.finish(p, p === 'LOST' ? 'timeout' : null)
    else {
      this.state = 'RUNNING'
      this.hooks.onChange?.()
    }
  }

  toResults () {
    if (this.state === 'WON' || this.state === 'LOST') {
      this.state = 'RESULTS'
      this.hooks.onChange?.()
    }
  }
  stats (): RunStats {
    return {
      activeSeconds: this.activeTime,
      distance: this.distance,
      pills: this.pills,
      bonusPoints: this.bonusPoints,
      collisions: this.collisions,
      brandedPills: this.brandedPills,
      quizCorrect: this.quizCorrect,
      quizWrong: this.quizWrong
    }
  }
  liveScore () {
    return computeScore(
      this.stats(),
      this.state === 'WON',
      this.rules.timeLimit
    )
  }

  private pause (index: number, pending: 'WON' | 'LOST' | null) {
    this.state = 'QUIZ_PAUSED'
    this.shown.add(index)
    this.nextQuiz = Math.max(this.nextQuiz, index + 1)
    this.pending = pending
    this.quizzesShown++
    this.hooks.onChange?.()
    this.hooks.onQuiz(index)
  }
  private finish (kind: 'WON' | 'LOST', reason: LossReason | null) {
    this.state = kind
    this.reason = reason
    this.hooks.onChange?.()
    this.hooks.onEnd({
      outcome: kind === 'WON' ? 'won' : 'lost',
      reason,
      activeSeconds: Math.round(this.activeTime * 100) / 100,
      distance: Math.floor(this.distance),
      pills: this.pills,
      brandedPills: this.brandedPills,
      bonusPoints: this.bonusPoints,
      collisions: this.collisions,
      hpRemaining: this.health,
      quizzesShown: this.quizzesShown
    })
  }
}
