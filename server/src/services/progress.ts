import { PlayerProgress } from '../models'
import { ACHIEVEMENTS, levelOfXp, type RunStats } from '../../../shared/rules'
import { HttpError } from '../middleware/http'

interface Input {
  userId: unknown
  session: any
  mission: any
  won: boolean
  qualifying: boolean
  stars: number
  score: number
  stats: RunStats
  rewards: { xp: number; coins: number }
  quiz: { correct: number; wrong: number }
}

/**
 * Applies a validated result to the player's progress exactly once:
 * guarded by `appliedSessions` (idempotency) and `rev` (optimistic concurrency, retried).
 * Losses never remove anything; completed missions and unlockedLevel only ever increase.
 */
export async function applyResult (i: Input) {
  const sid = String(i.session._id),
    mid = String(i.mission._id)
  for (let attempt = 0; attempt < 5; attempt++) {
    const p: any = await PlayerProgress.findOne({ user: i.userId })
    if (p.appliedSessions.includes(sid))
      return {
        progress: p,
        newBest: false,
        newAchievements: [] as string[],
        unlockedNew: false,
        levelBefore: levelOfXp(p.xp)
      }

    const prev = p.missions?.[mid] || {
      completions: 0,
      attempts: 0,
      bestScore: 0,
      bestStars: 0,
      bestTime: null
    }
    const best = {
      attempts: prev.attempts + 1,
      completions: prev.completions + (i.won ? 1 : 0),
      bestScore: Math.max(prev.bestScore, i.score),
      bestStars: Math.max(prev.bestStars, i.stars),
      bestTime: i.won
        ? prev.bestTime == null
          ? i.stats.activeSeconds
          : Math.min(prev.bestTime, i.stats.activeSeconds)
        : prev.bestTime,
      qualified: !!prev.qualified || i.qualifying,
      lastPlayedAt: new Date()
    }
    const totals = {
      runs: p.totals.runs + 1,
      wins: p.totals.wins + (i.won ? 1 : 0),
      pills: p.totals.pills + i.stats.pills,
      quizCorrect: p.totals.quizCorrect + i.quiz.correct
    }
    const newXp = p.xp + i.rewards.xp
    const earned = new Set<string>(p.achievements)
    const add = (k: string, ok: boolean) => {
      if (ok) earned.add(k)
    }
    add('first_win', i.won)
    add('sharp_mind', i.won && i.quiz.wrong === 0 && i.quiz.correct >= 2)
    add('untouchable', i.won && i.stats.collisions === 0)
    add('collector_100', totals.pills >= 100)
    add('level_5', levelOfXp(newXp) >= 5)
    add('three_stars', i.stars >= 3)
    const newAchievements = ACHIEVEMENTS.map(a => a.key as string).filter(
      k => earned.has(k) && !p.achievements.includes(k)
    )
    const unlockTo = i.qualifying
      ? Math.max(p.unlockedLevel, i.mission.level + 1)
      : p.unlockedLevel

    const upd = await PlayerProgress.updateOne(
      { _id: p._id, rev: p.rev, appliedSessions: { $ne: sid } },
      {
        $inc: {
          xp: i.rewards.xp,
          coins: i.rewards.coins,
          rev: 1,
          'totals.runs': 1,
          'totals.wins': i.won ? 1 : 0,
          'totals.pills': i.stats.pills,
          'totals.quizAnswered': i.quiz.correct + i.quiz.wrong,
          'totals.quizCorrect': i.quiz.correct,
          'totals.collisions': i.stats.collisions,
          'totals.playSeconds': Math.round(i.stats.activeSeconds)
        },
        $set: {
          [`missions.${mid}`]: best,
          personalBest: Math.max(p.personalBest, i.score),
          unlockedLevel: unlockTo
        },
        $addToSet: { achievements: { $each: newAchievements } },
        $push: { appliedSessions: { $each: [sid], $slice: -300 } }
      }
    )
    if (upd.modifiedCount === 1) {
      void totals
      const fresh: any = await PlayerProgress.findById(p._id)
      return {
        progress: fresh,
        newBest: i.score > p.personalBest,
        newAchievements,
        unlockedNew: unlockTo > p.unlockedLevel,
        levelBefore: levelOfXp(p.xp)
      }
    }
  }
  throw new HttpError(409, 'conflict', 'Progress is busy, please retry')
}
