import { Challenge, GameSession, User } from '../models'
import { now } from '../clock'
import { RANK_RULES } from '../../../shared/rules'

export const FINALIZE_GRACE_MS = 6 * 60_000 // lets runs started just before the deadline finish

export const challengeStatus = (c: any, t = now()) =>
  t < c.startsAt.getTime()
    ? 'scheduled'
    : t <= c.endsAt.getTime()
    ? 'open'
    : t <= c.endsAt.getTime() + FINALIZE_GRACE_MS && !c.finalized
    ? 'closing'
    : 'closed'

/** Published tie-break order (see RANK_RULES). Returns <0 when `a` ranks above `b`. */
export function compareAttempts (a: any, b: any): number {
  const aw = a.outcome === 'won',
    bw = b.outcome === 'won'
  if (aw !== bw) return aw ? -1 : 1
  if (a.quizCorrect !== b.quizCorrect) return b.quizCorrect - a.quizCorrect
  if (aw && bw) {
    if (a.activeSeconds !== b.activeSeconds)
      return a.activeSeconds - b.activeSeconds
  } else if (a.pills !== b.pills) return b.pills - a.pills
  if (a.collisions !== b.collisions) return a.collisions - b.collisions
  if (a.score !== b.score) return b.score - a.score
  const at = new Date(a.completedAt).getTime(),
    bt = new Date(b.completedAt).getTime()
  if (at !== bt) return at - bt
  return String(a.user) < String(b.user) ? -1 : 1
}

export async function standings (c: any) {
  if (c.finalized) return c.finalized.standings
  const sessions: any[] = await GameSession.find({
    challenge: c._id,
    status: 'completed'
  }).lean()
  const bestByUser = new Map<string, any>()
  for (const s of sessions) {
    const k = String(s.user),
      cur = bestByUser.get(k)
    if (!cur || compareAttempts(s, cur) < 0) bestByUser.set(k, s)
  }
  const rows = [...bestByUser.values()].sort(compareAttempts)
  const users: any[] = await User.find({ _id: { $in: rows.map(r => r.user) } })
    .select('displayName profession')
    .lean()
  const name = new Map(users.map(u => [String(u._id), u]))
  return rows.map((r, i) => ({
    rank: i + 1,
    userId: String(r.user),
    displayName: name.get(String(r.user))?.displayName || 'Player',
    profession: name.get(String(r.user))?.profession,
    outcome: r.outcome,
    score: r.score,
    stars: r.stars,
    quizCorrect: r.quizCorrect,
    activeSeconds: r.activeSeconds,
    collisions: r.collisions,
    pills: r.pills,
    finishedAt: r.completedAt
  }))
}

/** Freezes the final standings once the challenge window (+ grace for in-flight runs) has passed. Idempotent. */
export async function finalizeIfDue (c: any, force = false) {
  if (c.finalized || (!force && now() < c.endsAt.getTime() + FINALIZE_GRACE_MS))
    return c
  const rows = await standings(c)
  const doc = {
    at: new Date(now()),
    standings: rows,
    winners: rows
      .slice(0, 3)
      .map((r: any) => ({
        userId: r.userId,
        displayName: r.displayName,
        rank: r.rank
      }))
  }
  const upd: any = await Challenge.findOneAndUpdate(
    { _id: c._id, finalized: null },
    { $set: { finalized: doc } },
    { new: true }
  )
  return upd || (await Challenge.findById(c._id))
}
export const rankRules = () => RANK_RULES
