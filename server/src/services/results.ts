import { z } from 'zod'
import {
  Challenge,
  GameSession,
  Mission,
  QuizAttempt,
  Transaction
} from '../models'
import { HttpError } from '../middleware/http'
import { now } from '../clock'
import {
  withLock,
  audit,
  activeCampaign,
  ensureProgress,
  progressView
} from './common'
import { applyResult } from './progress'
import {
  computeRewards,
  computeScore,
  levelOfXp,
  maxDistanceFor,
  maxHitsFor,
  maxPillsFor,
  maxWallSeconds,
  starsFor,
  DAMAGE,
  MAX_PILLS_PER_SEC,
  QUIZ_PENALTY,
  QUIZ_HEAL,
  type RunStats
} from '../../../shared/rules'

export const completeSchema = z.object({
  outcome: z.enum(['won', 'lost']),
  reason: z.enum(['health', 'timeout']).nullable().optional(),
  stats: z.object({
    activeSeconds: z.number().min(0).max(400),
    distance: z.number().min(0).max(20000),
    pills: z.number().int().min(0).max(5000),
    brandedPills: z.number().int().min(0).max(5000),
    bonusPoints: z.number().min(0).max(300000),
    collisions: z.number().int().min(0).max(500),
    hpRemaining: z.number().min(0).max(1000)
  })
})

/** Server-side sanity checks. Anything that fails is flagged and the run is rejected (no rewards, no progression). */
function validateRun (
  s: any,
  mission: any,
  quiz: { correct: number; wrong: number },
  wallSec: number,
  claimed: 'won' | 'lost',
  branded: boolean
) {
  const flags: string[] = []
  if (s.activeSeconds > mission.timeLimit + 1)
    flags.push('active_time_over_limit')
  if (s.activeSeconds > wallSec + 2)
    flags.push('active_time_exceeds_wall_clock')
  if (s.distance > maxDistanceFor(s.activeSeconds))
    flags.push('distance_too_high')
  if (s.pills > maxPillsFor(s.distance)) flags.push('pills_too_high')
  if (s.pills > s.activeSeconds * MAX_PILLS_PER_SEC + 4)
    flags.push('pill_rate_too_high')
  if (s.collisions > maxHitsFor(s.distance)) flags.push('collisions_too_high')
  if (s.brandedPills > s.pills || (!branded && s.brandedPills > 0))
    flags.push('branded_pills_invalid')
  if (claimed === 'won') {
    if (s.pills < mission.objective.target) flags.push('objective_not_met')
    // Upper bound of possible health (ignores the max-health cap): must still be alive.
    if (
      mission.maxHealth -
        s.collisions * DAMAGE -
        quiz.wrong * QUIZ_PENALTY +
        quiz.correct * QUIZ_HEAL <=
      0
    )
      flags.push('health_depleted')
  }
  return flags
}

export const finalizeSession = (
  user: any,
  sessionId: string,
  body: z.infer<typeof completeSchema>
) => withLock(`user:${user._id}`, () => finalize(user, sessionId, body))
async function finalize (
  user: any,
  sessionId: string,
  body: z.infer<typeof completeSchema>
) {
  const t = now()
  let s: any = await GameSession.findOne({ _id: sessionId, user: user._id })
  if (!s) throw new HttpError(404, 'not_found', 'Session not found')
  if (s.result)
    return {
      ...s.result,
      replayed: true,
      httpStatus: s.status === 'rejected' ? 422 : 200
    }

  // Claim the session exactly once (a stale 'finalizing' claim can be retaken after 30s).
  const stale = new Date(t - 30_000)
  s = await GameSession.findOneAndUpdate(
    {
      _id: sessionId,
      user: user._id,
      $or: [
        { status: 'active' },
        { status: 'finalizing', finalizingAt: { $lt: stale } }
      ]
    },
    { status: 'finalizing', finalizingAt: new Date(t) },
    { new: true }
  )
  if (!s)
    throw new HttpError(
      409,
      'not_active',
      'This run is no longer active or is already being processed'
    )

  const mission: any = await Mission.findById(s.mission)
  const wallSec = (t - s.startedAt.getTime()) / 1000
  if (t > s.expiresAt.getTime()) {
    await GameSession.updateOne(
      { _id: s._id },
      {
        status: 'expired',
        outcome: 'lost',
        completedAt: new Date(t),
        'validation.status': 'expired'
      }
    )
    throw new HttpError(
      410,
      'session_expired',
      'The mission deadline passed before the result was submitted'
    )
  }

  const attempts: any[] = await QuizAttempt.find({ session: s._id }).lean()
  const quiz = {
    correct: attempts.filter(a => a.correct).length,
    wrong: attempts.filter(a => !a.correct).length
  }
  const st = body.stats
  const flags = validateRun(
    st,
    mission,
    quiz,
    wallSec,
    body.outcome,
    !!s.campaign
  )

  if (flags.length) {
    const result = {
      error: {
        code: 'run_rejected',
        message: 'This run could not be verified, so no rewards were granted.',
        details: flags
      }
    }
    await GameSession.updateOne(
      { _id: s._id },
      {
        status: 'rejected',
        completedAt: new Date(t),
        validation: { status: 'rejected', flags },
        result
      }
    )
    await audit(user._id, 'session.rejected', s._id, { flags })
    return { ...result, httpStatus: 422 }
  }

  const won = body.outcome === 'won'
  const stats: RunStats = {
    activeSeconds: st.activeSeconds,
    distance: st.distance,
    pills: st.pills,
    bonusPoints: st.bonusPoints,
    collisions: st.collisions,
    brandedPills: st.brandedPills,
    quizCorrect: quiz.correct,
    quizWrong: quiz.wrong
  }
  const score = computeScore(stats, won, mission.timeLimit)
  const stars = starsFor(stats, won, mission.timeLimit)

  const prog: any = await ensureProgress(user._id)
  const prev = prog.missions?.[String(mission._id)]
  const rewards = computeRewards(
    mission.reward,
    stats,
    won,
    stars,
    !!prev?.completions
  )
  const qualifying = won && stars >= mission.minStars

  for (const [kind, amount] of [
    ['xp', rewards.xp],
    ['coins', rewards.coins]
  ] as const) {
    if (amount > 0)
      await Transaction.create({
        user: user._id,
        kind,
        amount,
        reason: `mission:${mission.key}`,
        session: s._id,
        idempotencyKey: `session:${s._id}:${kind}`
      }).catch((e: any) => {
        if (e.code !== 11000) throw e
      })
  }
  const applied = await applyResult({
    userId: user._id,
    session: s,
    mission,
    won,
    qualifying,
    stars,
    score,
    stats,
    rewards,
    quiz
  })

  const nextMission: any = qualifying
    ? await Mission.findOne({
        level: mission.level + 1,
        status: 'active'
      }).lean()
    : null
  const campaign = s.campaign ? await activeCampaign(mission.level) : null
  const result = {
    outcome: body.outcome,
    reason: won ? null : body.reason || 'timeout',
    score,
    stars,
    xp: rewards.xp,
    coins: rewards.coins,
    qualifying,
    collisions: stats.collisions,
    pills: stats.pills,
    brandedPills: stats.brandedPills,
    activeSeconds: stats.activeSeconds,
    distance: Math.floor(stats.distance),
    quiz: {
      answered: attempts.length,
      correct: quiz.correct,
      accuracy: attempts.length ? quiz.correct / attempts.length : 0
    },
    newBest: applied.newBest,
    levelBefore: applied.levelBefore,
    levelAfter: levelOfXp(applied.progress.xp),
    unlocked:
      nextMission && applied.unlockedNew
        ? {
            id: String(nextMission._id),
            level: nextMission.level,
            title: nextMission.title
          }
        : null,
    nextMissionId: nextMission ? String(nextMission._id) : null,
    newAchievements: applied.newAchievements,
    progress: progressView(applied.progress),
    sponsor: campaign
      ? { name: campaign.sponsor, disclosure: campaign.disclosure }
      : null
  }
  await GameSession.updateOne(
    { _id: s._id },
    {
      status: 'completed',
      completedAt: new Date(t),
      outcome: body.outcome,
      reason: result.reason,
      score,
      stars,
      xpAwarded: rewards.xp,
      coinsAwarded: rewards.coins,
      activeSeconds: stats.activeSeconds,
      pills: stats.pills,
      brandedPills: stats.brandedPills,
      collisions: stats.collisions,
      quizCorrect: quiz.correct,
      quizAnswered: attempts.length,
      validation: { status: 'validated', flags: [] },
      result
    }
  )
  return { ...result, httpStatus: 200 }
}
export { Challenge }
