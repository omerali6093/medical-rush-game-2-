import { Router } from 'express'
import { Challenge, GameSession, Mission, User } from '../models'
import { HttpError, me, requireAuth, wrap } from '../middleware/http'
import { oid, withLock } from '../services/common'
import {
  challengeStatus,
  finalizeIfDue,
  rankRules,
  standings
} from '../services/ranking'
import { levelOfXp } from '../../../shared/rules'
import { PlayerProgress } from '../models'
import { now } from '../clock'

const router = Router()
router.use(requireAuth)

const view = (c: any, uid: unknown, m?: any) => ({
  id: String(c._id),
  title: c.title,
  description: c.description,
  missionId: String(c.mission),
  missionTitle: m?.title,
  missionLevel: c.missionLevel,
  startsAt: c.startsAt,
  endsAt: c.endsAt,
  status: challengeStatus(c),
  maxParticipants: c.maxParticipants,
  participantCount: c.participantCount,
  maxAttempts: c.maxAttempts,
  minLevel: c.minLevel,
  joined: c.participants.some((p: any) => String(p) === String(uid)),
  rules: rankRules(),
  finalized: !!c.finalized,
  winners: c.finalized?.winners || null
})

router.get(
  '/challenges',
  wrap(async (req, res) => {
    const cs: any[] = await Challenge.find({}).sort({ startsAt: -1 }).limit(30)
    const u = me(req)
    const visible = cs.filter(
      c =>
        !c.organization ||
        u.role === 'admin' ||
        (u.memberOf || []).some(
          (o: any) => String(o) === String(c.organization)
        ) ||
        String(u.organization) === String(c.organization)
    )
    const ms = new Map(
      (
        await Mission.find({ _id: { $in: visible.map(c => c.mission) } })
          .select('title')
          .lean()
      ).map((m: any) => [String(m._id), m])
    )
    res.json({
      challenges: visible.map(c => view(c, u._id, ms.get(String(c.mission))))
    })
  })
)

router.post(
  '/challenges/:id/join',
  wrap(async (req, res) => {
    const u = me(req),
      t = now(),
      id = oid(req.params.id)
    return withLock(`challenge:${id}`, async () => {
      const c: any = await Challenge.findById(id)
      if (!c) throw new HttpError(404, 'not_found', 'Challenge not found')
      if (challengeStatus(c, t) === 'closed' || t > c.endsAt.getTime())
        throw new HttpError(409, 'challenge_closed', 'This challenge has ended')
      if (
        c.organization &&
        u.role !== 'admin' &&
        !(u.memberOf || []).some(
          (o: any) => String(o) === String(c.organization)
        ) &&
        String(u.organization) !== String(c.organization)
      )
        throw new HttpError(
          403,
          'not_eligible',
          'This challenge is only open to members of the organizing team'
        )
      const p: any = await PlayerProgress.findOne({ user: u._id })
      if (levelOfXp(p?.xp || 0) < c.minLevel)
        throw new HttpError(
          403,
          'not_eligible',
          `Requires player level ${c.minLevel}`
        )
      if (c.participants.some((x: any) => String(x) === String(u._id)))
        return res.json({ challenge: view(c, u._id), alreadyJoined: true })
      // Atomic cap: only succeeds while there is room and the user is not already in (hard limit of 50 doctors).
      const upd: any = await Challenge.findOneAndUpdate(
        {
          _id: id,
          participants: { $ne: u._id },
          participantCount: { $lt: c.maxParticipants }
        },
        { $push: { participants: u._id }, $inc: { participantCount: 1 } },
        { new: true }
      )
      if (!upd)
        throw new HttpError(
          409,
          'challenge_full',
          `This challenge is full (${c.maxParticipants} players)`
        )
      res.json({ challenge: view(upd, u._id) })
    })
  })
)

router.get(
  '/leaderboards/global',
  wrap(async (req, res) => {
    const weekly = req.query.period === 'weekly',
      since = new Date(now() - 7 * 864e5)
    const rows: any[] = await GameSession.find({
      status: 'completed',
      outcome: 'won',
      ...(weekly ? { completedAt: { $gte: since } } : {})
    })
      .sort({ score: -1, completedAt: 1 })
      .limit(2000)
      .select('user score stars completedAt missionLevel')
      .lean()
    const best = new Map<string, any>()
    for (const r of rows)
      if (!best.has(String(r.user))) best.set(String(r.user), r)
    const top = [...best.values()].slice(0, 50)
    const users: any[] = await User.find({ _id: { $in: top.map(r => r.user) } })
      .select('displayName profession')
      .lean()
    const progress: any[] = await PlayerProgress.find({
      user: { $in: top.map(r => r.user) }
    })
      .select('user xp')
      .lean()
    const un = new Map(users.map(x => [String(x._id), x])),
      xp = new Map(progress.map(x => [String(x.user), x.xp]))
    const entries = top.map((r, i) => ({
      rank: i + 1,
      userId: String(r.user),
      displayName: un.get(String(r.user))?.displayName || 'Player',
      score: r.score,
      stars: r.stars,
      xp: xp.get(String(r.user)) || 0,
      level: levelOfXp(xp.get(String(r.user)) || 0)
    }))
    const mine = entries.find(e => e.userId === String(me(req)._id)) || null
    res.json({ period: weekly ? 'weekly' : 'all', entries, me: mine })
  })
)

router.get(
  '/leaderboards/:challengeId',
  wrap(async (req, res) => {
    let c: any = await Challenge.findById(oid(req.params.challengeId))
    if (!c) throw new HttpError(404, 'not_found', 'Challenge not found')
    c = await finalizeIfDue(c)
    const rows = await standings(c),
      mine = rows.find((r: any) => r.userId === String(me(req)._id)) || null
    res.json({
      challenge: view(c, me(req)._id),
      standings: rows,
      me: mine,
      frozen: !!c.finalized
    })
  })
)
export default router
