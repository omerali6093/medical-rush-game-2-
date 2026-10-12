import { Router } from 'express'
import { z } from 'zod'
import {
  GameSession,
  Mission,
  QuizAttempt,
  QuizQuestion,
  Challenge
} from '../models'
import { HttpError, me, parse, requireAuth, wrap } from '../middleware/http'
import { activeCampaign, ensureProgress, oid } from '../services/common'
import { permutation, pickQuizPlan } from '../services/quiz'
import { completeSchema, finalizeSession } from '../services/results'
import { challengeStatus } from '../services/ranking'
import { now } from '../clock'
import { QUIZ_CLOCK_TOLERANCE, maxWallSeconds } from '../../../shared/rules'

const router = Router()
router.use(requireAuth)

const missionView = (m: any, p?: any) => {
  const rec = p?.missions?.[String(m._id)]
  return {
    id: String(m._id),
    key: m.key,
    world: m.world,
    level: m.level,
    title: m.title,
    description: m.description,
    difficulty: m.difficulty,
    timeLimit: m.timeLimit,
    maxHealth: m.maxHealth,
    target: m.objective.target,
    quizAt: m.quizAt,
    quizSeconds: m.quizSeconds,
    requireFinalQuiz: m.requireFinalQuiz,
    reward: { xp: m.reward.xp, coins: m.reward.coins },
    ...(p
      ? {
          locked: m.level > p.unlockedLevel,
          completed: !!rec?.qualified,
          bestScore: rec?.bestScore || 0,
          bestStars: rec?.bestStars || 0,
          attempts: rec?.attempts || 0
        }
      : {})
  }
}

router.get(
  '/missions',
  wrap(async (req, res) => {
    const p: any = await ensureProgress(me(req)._id)
    const ms: any[] = await Mission.find({ status: 'active' })
      .sort({ level: 1 })
      .lean()
    res.json({
      missions: ms.map(m => missionView(m, p)),
      unlockedLevel: p.unlockedLevel
    })
  })
)
router.get(
  '/missions/:id',
  wrap(async (req, res) => {
    const m: any = await Mission.findById(oid(req.params.id)).lean()
    if (!m || m.status !== 'active')
      throw new HttpError(404, 'not_found', 'Mission not found')
    res.json({
      mission: missionView(m, await ensureProgress(me(req)._id)),
      brand: await activeCampaign(m.level)
    })
  })
)

router.post(
  '/game-sessions/start',
  wrap(async (req, res) => {
    const b = parse(
      z.object({ missionId: z.string(), challengeId: z.string().optional() }),
      req.body
    )
    const u = me(req),
      t = now()
    const mission: any = await Mission.findById(oid(b.missionId))
    if (!mission || mission.status !== 'active')
      throw new HttpError(404, 'not_found', 'Mission not found')
    const progress: any = await ensureProgress(u._id)
    if (mission.level > progress.unlockedLevel)
      throw new HttpError(
        403,
        'mission_locked',
        'Complete the previous mission to unlock this one'
      )

    let challenge: any = null
    if (b.challengeId) {
      challenge = await Challenge.findById(oid(b.challengeId))
      if (!challenge)
        throw new HttpError(404, 'not_found', 'Challenge not found')
      if (challengeStatus(challenge, t) !== 'open')
        throw new HttpError(
          409,
          'challenge_closed',
          'This challenge is not open for attempts'
        )
      if (!challenge.participants.some((x: any) => String(x) === String(u._id)))
        throw new HttpError(403, 'not_joined', 'Join the challenge first')
      if (String(challenge.mission) !== String(mission._id))
        throw new HttpError(
          400,
          'wrong_mission',
          'This challenge uses a different mission'
        )
      const used = await GameSession.countDocuments({
        user: u._id,
        challenge: challenge._id,
        status: { $in: ['completed', 'rejected', 'finalizing'] }
      }) // only finished runs use up an attempt
      if (used >= challenge.maxAttempts)
        throw new HttpError(
          409,
          'attempts_used',
          `All ${challenge.maxAttempts} challenge attempts are used`
        )
    }
    // One live timer per player: any unfinished run is abandoned (and can never be completed or rewarded).
    await GameSession.updateMany(
      { user: u._id, status: 'active' },
      { status: 'abandoned' }
    )
    const plan = await pickQuizPlan(
      u._id,
      mission.difficulty,
      mission.quizAt.length
    )
    const brand = await activeCampaign(mission.level)
    const session: any = await GameSession.create({
      user: u._id,
      mission: mission._id,
      missionLevel: mission.level,
      challenge: challenge?._id || null,
      campaign: brand ? brand.campaignId : null,
      quizPlan: plan,
      startedAt: new Date(t),
      expiresAt: new Date(
        t + maxWallSeconds(mission.timeLimit, mission.quizAt.length) * 1000
      )
    })
    res
      .status(201)
      .json({
        sessionId: String(session._id),
        startedAt: session.startedAt,
        expiresAt: session.expiresAt,
        mission: missionView(mission, progress),
        brand,
        challengeId: challenge ? String(challenge._id) : null
      })
  })
)

router.post(
  '/game-sessions/:id/complete',
  wrap(async (req, res) => {
    const body = parse(completeSchema, req.body)
    const { httpStatus, ...result } = await finalizeSession(
      me(req),
      String(oid(req.params.id)),
      body
    )
    res.status(httpStatus).json(result)
  })
)

// ---- quiz checkpoints ----
async function loadActiveSession (userId: unknown, id: unknown) {
  const s: any = await GameSession.findOne({ _id: oid(id), user: userId })
  if (!s) throw new HttpError(404, 'not_found', 'Session not found')
  if (s.status !== 'active')
    throw new HttpError(409, 'not_active', 'This run is not active')
  if (now() > s.expiresAt.getTime())
    throw new HttpError(
      410,
      'session_expired',
      'The mission deadline has passed'
    )
  return s
}
async function checkTiming (s: any, index: number) {
  const mission: any = await Mission.findById(s.mission).lean()
  if (!Number.isInteger(index) || index < 0 || index >= s.quizPlan.length)
    throw new HttpError(400, 'bad_checkpoint', 'Invalid checkpoint')
  const elapsed = (now() - s.startedAt.getTime()) / 1000
  if (elapsed < mission.quizAt[index] - QUIZ_CLOCK_TOLERANCE)
    throw new HttpError(425, 'too_early', 'This quiz checkpoint is not due yet')
  return mission
}

router.get(
  '/quiz/checkpoint',
  wrap(async (req, res) => {
    const index = Number(req.query.index),
      s = await loadActiveSession(me(req)._id, req.query.sessionId)
    const mission = await checkTiming(s, index)
    const done = await QuizAttempt.countDocuments({ session: s._id })
    const existing = await QuizAttempt.findOne({
      session: s._id,
      checkpointIndex: index
    }).lean()
    if (!existing && index !== done)
      throw new HttpError(
        409,
        'out_of_order',
        'Quiz checkpoints must be answered in order'
      )
    const q: any = await QuizQuestion.findById(s.quizPlan[index]).lean()
    const perm = permutation(String(s._id), index, q.options.length)
    res.json({
      checkpoint: {
        index,
        id: String(q._id),
        scenario: q.scenario,
        question: q.question,
        options: perm.map(i => q.options[i]),
        vitals: q.vitals || null,
        difficulty: q.difficulty,
        topics: q.topics,
        seconds: mission.quizSeconds,
        answered: !!existing
      }
    })
  })
)

router.post(
  '/quiz/attempts',
  wrap(async (req, res) => {
    const b = parse(
      z.object({
        sessionId: z.string(),
        checkpointIndex: z.number().int().min(0).max(9),
        selectedIndex: z.number().int().min(-1).max(2),
        responseMs: z.number().min(0).max(600000)
      }),
      req.body
    )
    const s = await loadActiveSession(me(req)._id, b.sessionId)
    const mission = await checkTiming(s, b.checkpointIndex)
    const q: any = await QuizQuestion.findById(
      s.quizPlan[b.checkpointIndex]
    ).lean()
    const perm = permutation(
        String(s._id),
        b.checkpointIndex,
        q.options.length
      ),
      correctShown = perm.indexOf(q.correctIndex)
    const reply = (a: any) => ({
      correct: a.correct,
      timedOut: a.timedOut,
      correctIndex: correctShown,
      explanation: q.explanation,
      xpPreview: a.correct ? mission.reward.quizXp : 0
    })

    const existing: any = await QuizAttempt.findOne({
      session: s._id,
      checkpointIndex: b.checkpointIndex
    }).lean()
    if (existing) return res.json({ ...reply(existing), replayed: true }) // idempotent: a repeat never changes the recorded answer
    const done = await QuizAttempt.countDocuments({ session: s._id })
    if (b.checkpointIndex !== done)
      throw new HttpError(
        409,
        'out_of_order',
        'Quiz checkpoints must be answered in order'
      )
    const timedOut =
      b.selectedIndex < 0 || b.responseMs > (mission.quizSeconds + 3) * 1000
    const attempt = {
      user: s.user,
      session: s._id,
      checkpointIndex: b.checkpointIndex,
      question: q._id,
      selectedIndex: b.selectedIndex,
      correct: !timedOut && b.selectedIndex === correctShown,
      timedOut,
      responseMs: Math.round(b.responseMs)
    }
    try {
      await QuizAttempt.create(attempt)
    } catch (e: any) {
      if (e.code !== 11000) throw e
    }
    res.status(201).json(reply(attempt))
  })
)
export default router
