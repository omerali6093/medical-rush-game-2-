import crypto from 'node:crypto'
import { Types } from 'mongoose'
import { AuditLog, Campaign, PlayerProgress } from '../models'
import { HttpError } from '../middleware/http'
import { now } from '../clock'
import { XP_PER_LEVEL, levelOfXp, ACHIEVEMENTS } from '../../../shared/rules'

export const oid = (v: unknown) => {
  if (!Types.ObjectId.isValid(String(v)))
    throw new HttpError(400, 'bad_id', 'Invalid identifier')
  return new Types.ObjectId(String(v))
}
export const audit = (
  actor: unknown,
  action: string,
  target?: unknown,
  meta?: unknown
) =>
  AuditLog.create({
    actor,
    action,
    target: target ? String(target) : undefined,
    meta
  }).catch(() => undefined)
/**
 * Per-key async mutex. Extra safety for read-modify-write sections (spend, join, finalize) within one Node process;
 * across several instances the MongoDB atomic conditional updates used in those sections remain the guarantee.
 */
const tails = new Map<string, Promise<void>>()
export async function withLock<T> (
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const prev = tails.get(key) || Promise.resolve()
  let release!: () => void
  const mine = new Promise<void>(r => {
    release = r
  })
  const tail = prev.then(() => mine)
  tails.set(key, tail)
  await prev
  try {
    return await fn()
  } finally {
    release()
    if (tails.get(key) === tail) tails.delete(key)
  }
}
export const sha256 = (s: string) =>
  crypto.createHash('sha256').update(s).digest('hex')

export async function ensureProgress (userId: unknown) {
  return (await PlayerProgress.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId } },
    { upsert: true, new: true }
  )) as any
}

export function progressView (p: any) {
  const level = levelOfXp(p.xp)
  return {
    xp: p.xp,
    coins: p.coins,
    level,
    xpIntoLevel: p.xp % XP_PER_LEVEL,
    xpForNext: XP_PER_LEVEL,
    unlockedLevel: p.unlockedLevel,
    personalBest: p.personalBest,
    totals: p.totals,
    inventory: p.inventory,
    missions: p.missions || {},
    achievements: ACHIEVEMENTS.map(a => ({
      ...a,
      earned: p.achievements.includes(a.key)
    }))
  }
}

/** Approved, in-window campaign for a mission level (or null). Logo is only exposed if its asset is approved too. */
export async function activeCampaign (level: number) {
  const t = new Date(now())
  const c: any = await Campaign.findOne({
    status: 'approved',
    startsAt: { $lte: t },
    endsAt: { $gte: t },
    $or: [{ allMissions: true }, { missions: level }]
  })
    .populate('asset')
    .sort({ updatedAt: -1 })
  if (!c) return null
  const asset = c.asset && c.asset.status === 'approved' ? c.asset : null
  return {
    campaignId: String(c._id),
    name: c.name,
    sponsor: c.sponsorName,
    disclosure: c.disclosure,
    label: c.collectible.label,
    color: c.collectible.color,
    logoUrl: asset ? `/api/brand-assets/${asset._id}` : null
  }
}
