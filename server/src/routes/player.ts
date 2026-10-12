import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import {
  GameSession,
  Mission,
  PlayerProgress,
  QuizAttempt,
  QuizQuestion,
  Transaction,
  User,
  PROFESSIONS,
  Challenge,
  QuizAttempt as QA
} from '../models'
import { HttpError, me, parse, requireAuth, wrap } from '../middleware/http'
import { ensureProgress, progressView } from '../services/common'
import { publicUser } from './auth'
import { SHOP } from '../../../shared/rules'
import { withLock } from '../services/common'
import { challengeStatus } from '../services/ranking'

const router = Router()
router.use(requireAuth)

router.get(
  '/me',
  wrap(async (req, res) => res.json({ user: publicUser(me(req)) }))
)
router.patch(
  '/me',
  wrap(async (req, res) => {
    const b = parse(
      z.object({
        displayName: z
          .string()
          .trim()
          .min(2)
          .max(30)
          .regex(/^[\p{L}\p{N} ._-]+$/u)
          .optional(),
        profession: z.enum(PROFESSIONS).optional()
      }),
      req.body
    )
    const u = me(req)
    if (b.displayName && b.displayName.toLowerCase() !== u.displayNameLower) {
      if (await User.findOne({ displayNameLower: b.displayName.toLowerCase() }))
        throw new HttpError(409, 'name_taken', 'That display name is taken')
      u.displayName = b.displayName
      u.displayNameLower = b.displayName.toLowerCase()
    }
    if (b.profession) u.profession = b.profession
    await u.save()
    res.json({ user: publicUser(u) })
  })
)
/** Privacy: full account deletion (profile, progress, runs, quiz attempts, transactions). Requires password confirmation. */
router.delete(
  '/me',
  wrap(async (req, res) => {
    const { password } = parse(
      z.object({ password: z.string().min(1) }),
      req.body
    )
    const u = me(req)
    if (!(await bcrypt.compare(password, u.passwordHash)))
      throw new HttpError(403, 'bad_credentials', 'Incorrect password')
    await Promise.all([
      PlayerProgress.deleteOne({ user: u._id }),
      GameSession.deleteMany({ user: u._id }),
      QA.deleteMany({ user: u._id }),
      Transaction.deleteMany({ user: u._id }),
      Challenge.updateMany(
        { participants: u._id },
        { $pull: { participants: u._id }, $inc: { participantCount: -1 } }
      )
    ])
    await User.deleteOne({ _id: u._id })
    res.clearCookie('pr_session', { path: '/' }).json({ ok: true })
  })
)

router.get(
  '/progress',
  wrap(async (req, res) =>
    res.json({ progress: progressView(await ensureProgress(me(req)._id)) })
  )
)

router.get(
  '/game-sessions',
  wrap(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 50),
      skip = Math.max(Number(req.query.skip) || 0, 0)
    const rows: any[] = await GameSession.find({
      user: me(req)._id,
      status: { $in: ['completed', 'rejected'] }
    })
      .sort({ startedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
    const ms = new Map(
      (
        await Mission.find({ _id: { $in: rows.map(r => r.mission) } })
          .select('title level')
          .lean()
      ).map((m: any) => [String(m._id), m])
    )
    res.json({
      sessions: rows.map(r => ({
        id: String(r._id),
        mission: ms.get(String(r.mission))?.title,
        level: ms.get(String(r.mission))?.level,
        outcome: r.outcome,
        status: r.status,
        score: r.score,
        stars: r.stars,
        xp: r.xpAwarded,
        coins: r.coinsAwarded,
        pills: r.pills,
        collisions: r.collisions,
        quizCorrect: r.quizCorrect,
        quizAnswered: r.quizAnswered,
        activeSeconds: r.activeSeconds,
        at: r.completedAt || r.startedAt,
        challenge: !!r.challenge
      }))
    })
  })
)

router.get(
  '/dashboard',
  wrap(async (req, res) => {
    const uid = me(req)._id,
      progress = progressView(await ensureProgress(uid))
    const attempts: any[] = await QuizAttempt.find({ user: uid })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean()
    const qs = new Map(
      (
        await QuizQuestion.find({
          _id: { $in: [...new Set(attempts.map(a => String(a.question)))] }
        })
          .select('topics')
          .lean()
      ).map((q: any) => [String(q._id), q])
    )
    const topics = new Map<string, { answered: number; correct: number }>()
    for (const a of attempts)
      for (const t of qs.get(String(a.question))?.topics?.length
        ? qs.get(String(a.question)).topics
        : ['general']) {
        const r = topics.get(t) || { answered: 0, correct: 0 }
        r.answered++
        if (a.correct) r.correct++
        topics.set(t, r)
      }
    const recent: any[] = await GameSession.find({
      user: uid,
      status: 'completed'
    })
      .sort({ completedAt: -1 })
      .limit(8)
      .lean()
    const ms = new Map(
      (
        await Mission.find({ _id: { $in: recent.map(r => r.mission) } })
          .select('title level')
          .lean()
      ).map((m: any) => [String(m._id), m])
    )
    const t = progress.totals
    const chs: any[] = await Challenge.find({ participants: uid })
      .sort({ endsAt: -1 })
      .limit(5)
      .lean()
    res.json({
      progress,
      quiz: {
        answered: t.quizAnswered,
        correct: t.quizCorrect,
        accuracy: t.quizAnswered ? t.quizCorrect / t.quizAnswered : 0,
        byTopic: [...topics]
          .map(([topic, v]) => ({
            topic,
            ...v,
            accuracy: v.correct / v.answered
          }))
          .sort((a, b) => b.answered - a.answered)
          .slice(0, 8)
      },
      recent: recent.map(r => ({
        id: String(r._id),
        mission: ms.get(String(r.mission))?.title,
        level: ms.get(String(r.mission))?.level,
        outcome: r.outcome,
        score: r.score,
        stars: r.stars,
        at: r.completedAt
      })),
      challenges: chs.map(c => ({
        id: String(c._id),
        title: c.title,
        status: challengeStatus(c),
        endsAt: c.endsAt
      }))
    })
  })
)

router.get(
  '/rewards/balance',
  wrap(async (req, res) => {
    const p = await ensureProgress(me(req)._id)
    res.json({ coins: p.coins, xp: p.xp, inventory: p.inventory, shop: SHOP })
  })
)
router.post(
  '/rewards/spend',
  wrap(async (req, res) => {
    const { itemId } = parse(z.object({ itemId: z.string() }), req.body)
    const item = SHOP.find(s => s.id === itemId)
    if (!item) throw new HttpError(404, 'no_such_item', 'Unknown item')
    const uid = me(req)._id
    const out = await withLock(`user:${uid}`, async () => {
      // Atomic: balance check + deduction + ownership in one update, so double-clicks / races cannot overspend or double-buy.
      const upd: any = await PlayerProgress.findOneAndUpdate(
        { user: uid, coins: { $gte: item.price }, inventory: { $ne: item.id } },
        { $inc: { coins: -item.price, rev: 1 }, $push: { inventory: item.id } },
        { new: true }
      )
      if (!upd) {
        const p: any = await ensureProgress(uid)
        throw p.inventory.includes(item.id)
          ? new HttpError(409, 'already_owned', 'You already own this item')
          : new HttpError(402, 'insufficient_coins', 'Not enough coins')
      }
      await Transaction.create({
        user: uid,
        kind: 'spend',
        amount: -item.price,
        reason: item.id,
        idempotencyKey: `spend:${uid}:${item.id}`
      }).catch(() => undefined)
      return upd
    })
    res.json({ progress: progressView(out) })
  })
)
export default router
