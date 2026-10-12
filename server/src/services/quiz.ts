import crypto from 'node:crypto'
import { QuizAttempt, QuizQuestion } from '../models'
import { HttpError } from '../middleware/http'

/** Deterministic option shuffle per (session, checkpoint) so correctness can be re-derived server-side without storing it. */
export function permutation (
  sessionId: string,
  index: number,
  n: number
): number[] {
  const h = crypto.createHash('sha256').update(`${sessionId}:${index}`).digest()
  const arr = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = h[i] % (i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr // shown[k] = original option arr[k]
}

/** Picks `count` distinct approved questions at or below the mission difficulty, preferring ones the player has not seen recently. */
export async function pickQuizPlan (
  userId: unknown,
  difficulty: number,
  count: number
) {
  const pool: any[] = await QuizQuestion.find({
    status: 'approved',
    difficulty: { $lte: difficulty }
  })
    .select('_id difficulty')
    .lean()
  if (pool.length < count)
    throw new HttpError(
      503,
      'no_quiz_content',
      'Not enough approved quiz questions are available yet'
    )
  const recent = new Set(
    (
      await QuizAttempt.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(25)
        .select('question')
        .lean()
    ).map((a: any) => String(a.question))
  )
  const scored = pool.map(q => ({
    id: q._id,
    k:
      (recent.has(String(q._id)) ? 10 : 0) +
      Math.abs(difficulty - q.difficulty) * 2 +
      Math.random()
  }))
  scored.sort((a, b) => a.k - b.k)
  return scored.slice(0, count).map(s => s.id)
}
