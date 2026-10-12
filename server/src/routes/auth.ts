import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { z } from 'zod'
import { User, PROFESSIONS, PlayerProgress } from '../models'
import {
  HttpError,
  me,
  parse,
  setSessionCookie,
  signToken,
  wrap,
  requireAuth
} from '../middleware/http'
import { config } from '../config'
import { ensureProgress, progressView, sha256 } from '../services/common'
import { now } from '../clock'

export const publicUser = (u: any) => ({
  id: String(u._id),
  email: u.email,
  displayName: u.displayName,
  profession: u.profession,
  role: u.role,
  organization: u.organization ? String(u.organization) : null
})
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .refine(
    p => /[A-Za-z]/.test(p) && /\d/.test(p),
    'Password needs letters and numbers'
  )
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10)

const router = Router()

router.post(
  '/signup',
  wrap(async (req, res) => {
    const b = parse(
      z.object({
        email: z.string().email().max(120),
        password,
        displayName: z
          .string()
          .trim()
          .min(2)
          .max(30)
          .regex(/^[\p{L}\p{N} ._-]+$/u, 'Display name has invalid characters'),
        profession: z.enum(PROFESSIONS),
        acceptTerms: z.literal(true, {
          message: 'You must accept the privacy notice and terms'
        })
      }),
      req.body
    )
    const email = b.email.toLowerCase()
    if (await User.findOne({ email }))
      throw new HttpError(
        409,
        'email_taken',
        'An account with this email already exists'
      )
    if (await User.findOne({ displayNameLower: b.displayName.toLowerCase() }))
      throw new HttpError(409, 'name_taken', 'That display name is taken')
    const user: any = await User.create({
      email,
      passwordHash: await bcrypt.hash(b.password, 11),
      displayName: b.displayName,
      displayNameLower: b.displayName.toLowerCase(),
      profession: b.profession
    })
    const progress = await ensureProgress(user._id)
    setSessionCookie(res, signToken(String(user._id), user.tokenVersion))
    res
      .status(201)
      .json({ user: publicUser(user), progress: progressView(progress) })
  })
)

router.post(
  '/login',
  wrap(async (req, res) => {
    const b = parse(
      z.object({
        email: z.string().email(),
        password: z.string().min(1).max(128)
      }),
      req.body
    )
    const user: any = await User.findOne({ email: b.email.toLowerCase() })
    const ok = await bcrypt.compare(
      b.password,
      user?.passwordHash || DUMMY_HASH
    ) // constant-ish time: no user enumeration
    if (!user || !ok)
      throw new HttpError(401, 'bad_credentials', 'Incorrect email or password')
    user.lastLoginAt = new Date(now())
    await user.save()
    setSessionCookie(res, signToken(String(user._id), user.tokenVersion))
    res.json({
      user: publicUser(user),
      progress: progressView(await ensureProgress(user._id))
    })
  })
)

router.post('/logout', (_req, res) => {
  res.clearCookie(config.cookieName, { path: '/' })
  res.json({ ok: true })
})

router.post(
  '/forgot-password',
  wrap(async (req, res) => {
    const { email } = parse(z.object({ email: z.string().email() }), req.body)
    const user: any = await User.findOne({ email: email.toLowerCase() })
    let devToken: string | undefined
    if (user) {
      const token = crypto.randomBytes(32).toString('hex')
      user.resetTokenHash = sha256(token)
      user.resetExpires = new Date(now() + 30 * 60_000)
      await user.save()
      if (config.isProd)
        console.log(
          `[mail] password reset requested for user ${user._id} (wire an email provider here)`
        )
      else devToken = token
    }
    res.json({
      ok: true,
      message: 'If that email exists, a reset link has been sent.',
      ...(devToken ? { devResetToken: devToken } : {})
    })
  })
)

router.post(
  '/reset-password',
  wrap(async (req, res) => {
    const b = parse(z.object({ token: z.string().min(20), password }), req.body)
    const user: any = await User.findOne({
      resetTokenHash: sha256(b.token),
      resetExpires: { $gt: new Date(now()) }
    })
    if (!user)
      throw new HttpError(
        400,
        'bad_token',
        'This reset link is invalid or has expired'
      )
    user.passwordHash = await bcrypt.hash(b.password, 11)
    user.resetTokenHash = null
    user.resetExpires = null
    user.tokenVersion += 1
    await user.save() // invalidates every existing session
    res.json({ ok: true })
  })
)

router.get(
  '/me',
  requireAuth,
  wrap(async (req, res) =>
    res.json({
      user: publicUser(me(req)),
      progress: progressView(await ensureProgress(me(req)._id))
    })
  )
)
export default router
export { PlayerProgress }
