import { Router, type Request } from 'express'
import { z } from 'zod'
import {
  AuditLog,
  BrandAsset,
  Campaign,
  Challenge,
  GameSession,
  Mission,
  Organization,
  QuizAttempt,
  QuizQuestion,
  User
} from '../models'
import { HttpError, me, parse, requireRole, wrap } from '../middleware/http'
import { audit, oid } from '../services/common'
import { finalizeIfDue, challengeStatus, standings } from '../services/ranking'
import { now } from '../clock'

const router = Router()
router.use(requireRole('admin', 'org_admin'))
const adminOnly = requireRole('admin')
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
/** org_admins may only touch their own organization; admins may touch any. */
const orgScope = (req: Request, orgId: unknown) => {
  const u = me(req)
  if (u.role !== 'admin' && String(u.organization) !== String(orgId))
    throw new HttpError(
      403,
      'forbidden',
      'You can only manage your own organization'
    )
}
const scopeFilter = (req: Request, key = 'org') =>
  me(req).role === 'admin' ? {} : { [key]: me(req).organization }

// ---------- Missions (admin) ----------
const missionBody = z.object({
  key: z.string().min(2).max(40),
  title: z.string().min(2).max(60),
  description: z.string().max(300).default(''),
  level: z.number().int().min(1).max(100),
  difficulty: z.number().int().min(1).max(3),
  timeLimit: z.number().int().min(30).max(180).default(180),
  maxHealth: z.number().int().min(20).max(200).default(100),
  target: z.number().int().min(5).max(1000),
  quizAt: z
    .array(z.number().int().min(10).max(180))
    .min(1)
    .max(3)
    .default([60, 120, 180]),
  quizSeconds: z.number().int().min(5).max(30).default(12),
  requireFinalQuiz: z.boolean().default(false),
  minStars: z.number().int().min(1).max(3).default(1),
  status: z.enum(['draft', 'active']).default('active'),
  reward: z.object({
    xp: z.number().int().min(0).max(1000),
    coins: z.number().int().min(0).max(500),
    quizXp: z.number().int().min(0).max(200),
    maxXp: z.number().int().min(0).max(2000),
    maxCoins: z.number().int().min(0).max(1000)
  })
})
const toMission = (b: z.infer<typeof missionBody>) => ({
  ...b,
  objective: { type: 'collect', target: b.target },
  target: undefined
})
router.get(
  '/missions',
  adminOnly,
  wrap(async (_q, res) =>
    res.json({ missions: await Mission.find().sort({ level: 1 }).lean() })
  )
)
router.post(
  '/missions',
  adminOnly,
  wrap(async (req, res) => {
    const m: any = await Mission.create(toMission(parse(missionBody, req.body)))
    await audit(me(req)._id, 'mission.create', m._id)
    res.status(201).json({ mission: m })
  })
)
const present = (b: any, body: any) =>
  Object.fromEntries(Object.entries(b).filter(([k]) => k in (body || {}))) // zod defaults must not overwrite fields a PATCH did not send
router.patch(
  '/missions/:id',
  adminOnly,
  wrap(async (req, res) => {
    const b = present(
      parse(
        missionBody
          .partial()
          .extend({ reward: missionBody.shape.reward.partial().optional() }),
        req.body
      ),
      req.body
    ) as any
    const upd: any = { ...b }
    if (b.target !== undefined) {
      upd['objective.target'] = b.target
      delete upd.target
    }
    if (b.reward) {
      for (const k of Object.keys(b.reward)) upd[`reward.${k}`] = b.reward[k]
      delete upd.reward
    }
    const m = await Mission.findByIdAndUpdate(
      oid(req.params.id),
      { $set: upd },
      { new: true }
    )
    if (!m) throw new HttpError(404, 'not_found', 'Mission not found')
    await audit(me(req)._id, 'mission.update', m._id, b)
    res.json({ mission: m })
  })
)

// ---------- Quiz content workflow ----------
const questionBody = z.object({
  scenario: z.string().min(10).max(500),
  question: z.string().min(5).max(250),
  options: z.array(z.string().min(1).max(120)).length(3),
  correctIndex: z.number().int().min(0).max(2),
  explanation: z.string().min(10).max(500),
  difficulty: z.number().int().min(1).max(3),
  topics: z.array(z.string().max(30)).max(5).default([]),
  vitals: z
    .object({ hr: z.number(), bp: z.string().max(10), spo2: z.number() })
    .optional()
})
router.get(
  '/questions',
  adminOnly,
  wrap(async (req, res) =>
    res.json({
      questions: await QuizQuestion.find(
        req.query.status ? { status: String(req.query.status) } : {}
      )
        .sort({ createdAt: -1 })
        .limit(200)
        .lean()
    })
  )
)
router.post(
  '/questions',
  adminOnly,
  wrap(async (req, res) => {
    const q: any = await QuizQuestion.create({
      ...parse(questionBody, req.body),
      status: 'draft',
      createdBy: me(req)._id
    })
    await audit(me(req)._id, 'question.create', q._id)
    res.status(201).json({ question: q })
  })
)
router.patch(
  '/questions/:id',
  adminOnly,
  wrap(async (req, res) => {
    // Any content edit sends the question back to draft: reviewers must re-approve changed medical content.
    const q = await QuizQuestion.findByIdAndUpdate(
      oid(req.params.id),
      {
        $set: {
          ...present(parse(questionBody.partial(), req.body), req.body),
          status: 'draft',
          reviewedBy: null,
          reviewedAt: null
        }
      },
      { new: true }
    )
    if (!q) throw new HttpError(404, 'not_found', 'Question not found')
    await audit(me(req)._id, 'question.update', q._id)
    res.json({ question: q })
  })
)
router.post(
  '/questions/:id/review',
  adminOnly,
  wrap(async (req, res) => {
    const { status } = parse(
      z.object({ status: z.enum(['approved', 'retired', 'draft']) }),
      req.body
    )
    const q: any = await QuizQuestion.findById(oid(req.params.id))
    if (!q) throw new HttpError(404, 'not_found', 'Question not found')
    if (status === 'approved' && String(q.createdBy) === String(me(req)._id))
      throw new HttpError(
        403,
        'self_review',
        'A question must be approved by a different reviewer than its author'
      )
    q.status = status
    q.reviewedBy = me(req)._id
    q.reviewedAt = new Date(now())
    await q.save()
    await audit(me(req)._id, `question.${status}`, q._id)
    res.json({ question: q })
  })
)

// ---------- Organizations, members ----------
router.get(
  '/organizations',
  wrap(async (req, res) =>
    res.json({
      organizations: await Organization.find(
        me(req).role === 'admin' ? {} : { _id: me(req).organization }
      ).lean()
    })
  )
)
router.post(
  '/organizations',
  adminOnly,
  wrap(async (req, res) => {
    const b = parse(
      z.object({
        name: z.string().min(2).max(60),
        contactEmail: z.string().email().optional()
      }),
      req.body
    )
    const o: any = await Organization.create({
      ...b,
      slug: slug(b.name)
    }).catch((e: any) => {
      throw e.code === 11000
        ? new HttpError(409, 'duplicate', 'Organization already exists')
        : e
    })
    await audit(me(req)._id, 'org.create', o._id)
    res.status(201).json({ organization: o })
  })
)
router.post(
  '/organizations/:id/members',
  wrap(async (req, res) => {
    const id = oid(req.params.id)
    orgScope(req, id)
    const { email, makeOrgAdmin } = parse(
      z.object({
        email: z.string().email(),
        makeOrgAdmin: z.boolean().optional()
      }),
      req.body
    )
    const u: any = await User.findOne({ email: email.toLowerCase() })
    if (!u) throw new HttpError(404, 'not_found', 'No player with that email')
    if (!u.memberOf.some((o: any) => String(o) === String(id)))
      u.memberOf.push(id)
    if (makeOrgAdmin) {
      if (me(req).role !== 'admin')
        throw new HttpError(
          403,
          'forbidden',
          'Only platform admins can appoint organization admins'
        )
      u.role = u.role === 'admin' ? 'admin' : 'org_admin'
      u.organization = id
    }
    await u.save()
    await audit(me(req)._id, 'org.member', id, { user: u._id, makeOrgAdmin })
    res.json({ ok: true })
  })
)

// ---------- Brand assets & sponsored campaigns ----------
const MAGIC: [string, number[]][] = [
  ['image/png', [0x89, 0x50, 0x4e, 0x47]],
  ['image/jpeg', [0xff, 0xd8, 0xff]],
  ['image/webp', [0x52, 0x49, 0x46, 0x46]]
]
router.get(
  '/assets',
  wrap(async (req, res) =>
    res.json({
      assets: await BrandAsset.find(scopeFilter(req))
        .select('-data')
        .sort({ createdAt: -1 })
        .lean()
    })
  )
)
router.post(
  '/assets',
  wrap(async (req, res) => {
    const b = parse(
      z.object({
        orgId: z.string(),
        name: z.string().min(2).max(60),
        mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
        dataBase64: z.string().max(360_000)
      }),
      req.body
    )
    const orgId = oid(b.orgId)
    orgScope(req, orgId)
    const buf = Buffer.from(b.dataBase64, 'base64')
    if (buf.length === 0 || buf.length > 256 * 1024)
      throw new HttpError(400, 'bad_asset', 'Logo must be 256 KB or smaller')
    const magic = MAGIC.find(m => m[0] === b.mime)![1]
    if (!magic.every((v, i) => buf[i] === v))
      throw new HttpError(
        400,
        'bad_asset',
        'File content does not match its type'
      )
    const a: any = await BrandAsset.create({
      org: orgId,
      name: b.name,
      mime: b.mime,
      data: b.dataBase64,
      size: buf.length,
      uploadedBy: me(req)._id
    })
    await audit(me(req)._id, 'asset.upload', a._id)
    res
      .status(201)
      .json({ asset: { id: String(a._id), name: a.name, status: a.status } })
  })
)
router.post(
  '/assets/:id/review',
  adminOnly,
  wrap(async (req, res) => {
    const { status } = parse(
      z.object({ status: z.enum(['approved', 'rejected']) }),
      req.body
    )
    const id = oid(req.params.id)
    await BrandAsset.updateOne({ _id: id }, { status, reviewedBy: me(req)._id })
    const a = await BrandAsset.findById(id).select('-data')
    if (!a) throw new HttpError(404, 'not_found', 'Asset not found')
    await audit(me(req)._id, `asset.${status}`, a._id)
    res.json({ asset: a })
  })
)

const campaignBody = z.object({
  orgId: z.string(),
  name: z.string().min(2).max(60),
  sponsorName: z.string().min(2).max(60),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  assetId: z.string().nullable().optional(),
  label: z.string().min(2).max(30).default('Sponsored dose'),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#22e4ff'),
  disclosure: z
    .string()
    .min(10, 'A clear sponsorship disclosure is required')
    .max(200),
  missions: z.array(z.number().int()).max(100).default([])
})
router.get(
  '/campaigns',
  wrap(async (req, res) =>
    res.json({
      campaigns: await Campaign.find(scopeFilter(req))
        .sort({ createdAt: -1 })
        .lean()
    })
  )
)
router.post(
  '/campaigns',
  wrap(async (req, res) => {
    const b = parse(campaignBody, req.body),
      orgId = oid(b.orgId)
    orgScope(req, orgId)
    if (b.endsAt <= b.startsAt)
      throw new HttpError(400, 'bad_dates', 'End date must be after start date')
    if (b.assetId) {
      const a: any = await BrandAsset.findById(oid(b.assetId))
      if (!a || String(a.org) !== String(orgId))
        throw new HttpError(
          400,
          'bad_asset',
          'Logo must belong to the same organization'
        )
    }
    const c: any = await Campaign.create({
      org: orgId,
      name: b.name,
      sponsorName: b.sponsorName,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      asset: b.assetId || null,
      collectible: { label: b.label, color: b.color },
      disclosure: b.disclosure,
      allMissions: b.missions.length === 0,
      missions: b.missions
    })
    await audit(me(req)._id, 'campaign.create', c._id)
    res.status(201).json({ campaign: c })
  })
)
router.post(
  '/campaigns/:id/status',
  wrap(async (req, res) => {
    const { status } = parse(
      z.object({ status: z.enum(['pending', 'approved', 'paused', 'ended']) }),
      req.body
    )
    const c: any = await Campaign.findById(oid(req.params.id))
    if (!c) throw new HttpError(404, 'not_found', 'Campaign not found')
    orgScope(req, c.org)
    // Org admins can only submit for review or pause; only platform admins can approve (go live).
    if (me(req).role !== 'admin' && !['pending', 'paused'].includes(status))
      throw new HttpError(
        403,
        'forbidden',
        'Only a platform admin can approve a campaign'
      )
    if (status === 'approved') {
      const a: any = c.asset ? await BrandAsset.findById(c.asset) : null
      if (c.asset && a?.status !== 'approved')
        throw new HttpError(
          409,
          'asset_not_approved',
          'Approve the logo asset first'
        )
      c.approvedBy = me(req)._id
    }
    c.status = status
    await c.save()
    await audit(me(req)._id, `campaign.${status}`, c._id)
    res.json({ campaign: c })
  })
)

// ---------- Challenges ----------
router.get(
  '/challenges',
  wrap(async (req, res) => {
    const cs: any[] = await Challenge.find(scopeFilter(req, 'organization'))
      .sort({ startsAt: -1 })
      .limit(50)
      .lean()
    res.json({
      challenges: cs.map(c => ({
        ...c,
        participants: undefined,
        status: challengeStatus(c)
      }))
    })
  })
)
router.post(
  '/challenges',
  wrap(async (req, res) => {
    const b = parse(
      z.object({
        title: z.string().min(3).max(80),
        description: z.string().max(400).default(''),
        missionId: z.string(),
        orgId: z.string().nullable().optional(),
        startsAt: z.coerce.date(),
        endsAt: z.coerce.date(),
        maxParticipants: z.number().int().min(2).max(50).default(50),
        maxAttempts: z.number().int().min(1).max(10).default(3),
        minLevel: z.number().int().min(1).max(100).default(1)
      }),
      req.body
    )
    if (b.endsAt <= b.startsAt)
      throw new HttpError(400, 'bad_dates', 'End date must be after start date')
    const u = me(req),
      orgId =
        u.role === 'admin' ? (b.orgId ? oid(b.orgId) : null) : u.organization
    if (u.role !== 'admin' && !orgId)
      throw new HttpError(
        403,
        'forbidden',
        'Join an organization to create challenges'
      )
    const m: any = await Mission.findById(oid(b.missionId))
    if (!m) throw new HttpError(404, 'not_found', 'Mission not found')
    const c: any = await Challenge.create({
      title: b.title,
      description: b.description,
      mission: m._id,
      missionLevel: m.level,
      organization: orgId,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      maxParticipants: b.maxParticipants,
      maxAttempts: b.maxAttempts,
      minLevel: b.minLevel,
      createdBy: u._id
    })
    await audit(u._id, 'challenge.create', c._id)
    res.status(201).json({ challenge: { id: String(c._id), title: c.title } })
  })
)
router.post(
  '/challenges/:id/finalize',
  wrap(async (req, res) => {
    const c: any = await Challenge.findById(oid(req.params.id))
    if (!c) throw new HttpError(404, 'not_found', 'Challenge not found')
    if (c.organization) orgScope(req, c.organization)
    else if (me(req).role !== 'admin')
      throw new HttpError(403, 'forbidden', 'Not allowed')
    if (now() < c.endsAt.getTime())
      throw new HttpError(409, 'still_open', 'The challenge is still running')
    const f = await finalizeIfDue(c, true)
    await audit(me(req)._id, 'challenge.finalize', c._id)
    res.json({ standings: await standings(f), frozen: true })
  })
)

// ---------- Reports ----------
router.get(
  '/reports/overview',
  adminOnly,
  wrap(async (_q, res) => {
    const [players, sessions, validated, rejected] = await Promise.all([
      User.countDocuments({ role: 'player' }),
      GameSession.countDocuments({}),
      GameSession.find({ status: 'completed' })
        .select('outcome score quizCorrect quizAnswered activeSeconds')
        .lean(),
      GameSession.countDocuments({ status: 'rejected' })
    ])
    const v: any[] = validated,
      wins = v.filter(s => s.outcome === 'won').length,
      ans = v.reduce((a, s) => a + s.quizAnswered, 0),
      cor = v.reduce((a, s) => a + s.quizCorrect, 0)
    res.json({
      players,
      sessions,
      completed: v.length,
      rejected,
      winRate: v.length ? wins / v.length : 0,
      avgScore: v.length
        ? Math.round(v.reduce((a, s) => a + s.score, 0) / v.length)
        : 0,
      quizAccuracy: ans ? cor / ans : 0,
      avgActiveSeconds: v.length
        ? Math.round(v.reduce((a, s) => a + s.activeSeconds, 0) / v.length)
        : 0
    })
  })
)
router.get(
  '/reports/questions',
  adminOnly,
  wrap(async (_q, res) => {
    const at: any[] = await QuizAttempt.find({})
        .select('question correct responseMs')
        .lean(),
      by = new Map<string, any>()
    for (const a of at) {
      const r = by.get(String(a.question)) || { answered: 0, correct: 0, ms: 0 }
      r.answered++
      r.ms += a.responseMs
      if (a.correct) r.correct++
      by.set(String(a.question), r)
    }
    const qs: any[] = await QuizQuestion.find({ _id: { $in: [...by.keys()] } })
      .select('question difficulty status')
      .lean()
    res.json({
      questions: qs
        .map(q => {
          const r = by.get(String(q._id))
          return {
            id: String(q._id),
            question: q.question,
            difficulty: q.difficulty,
            status: q.status,
            answered: r.answered,
            correctRate: r.correct / r.answered,
            avgSeconds: Math.round(r.ms / r.answered / 100) / 10
          }
        })
        .sort((a, b) => a.correctRate - b.correctRate)
    })
  })
)
router.get(
  '/reports/campaigns',
  wrap(async (req, res) => {
    const cs: any[] = await Campaign.find(scopeFilter(req)).lean()
    const ss: any[] = await GameSession.find({
      campaign: { $in: cs.map(c => c._id) },
      status: 'completed'
    })
      .select('campaign brandedPills user')
      .lean()
    res.json({
      campaigns: cs.map(c => {
        const mine = ss.filter(s => String(s.campaign) === String(c._id))
        return {
          id: String(c._id),
          name: c.name,
          sponsor: c.sponsorName,
          status: c.status,
          runs: mine.length,
          players: new Set(mine.map(s => String(s.user))).size,
          brandedCollected: mine.reduce((a, s) => a + s.brandedPills, 0)
        }
      })
    })
  })
)
router.get(
  '/reports/audit',
  adminOnly,
  wrap(async (_q, res) =>
    res.json({ log: await AuditLog.find().sort({ at: -1 }).limit(50).lean() })
  )
)
export default router
