import type { Brand, MissionInfo } from '../../api/types'
import type { Screen } from '../../types'
import { Btn, Panel } from '../ui/motion'
import { Notice, useLoad } from '../ui/forms'

const mmss = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
interface Props {
  mission: MissionInfo
  challengeId?: string
  starting: boolean
  error: string | null
  go: (s: Screen) => void
  onStart: () => void
}

/** Rules are shown BEFORE the run so win/loss is never a surprise. */
export default function Briefing ({
  mission: m,
  challengeId,
  starting,
  error,
  go,
  onStart
}: Props) {
  const { data } = useLoad<{ brand: Brand | null }>(`/missions/${m.id}`)
  const brand = data?.brand
  return (
    <Panel id='briefing' top>
      <div className='card glass'>
        <div className='tag' style={{ textAlign: 'left' }}>
          {challengeId ? '🏆 Challenge attempt' : `Level ${m.level}`} ·{' '}
          {m.world}
        </div>
        <h2>{m.title}</h2>
        <div className='pat'>{m.description}</div>
        <div className='res'>
          <div>
            <b>💊 {m.target}</b>
            <small>OBJECTIVE</small>
          </div>
          <div>
            <b>{mmss(m.timeLimit)}</b>
            <small>TIME LIMIT</small>
          </div>
          <div>
            <b>❤ {m.maxHealth}</b>
            <small>HEALTH</small>
          </div>
          <div>
            <b>{m.quizAt.length}</b>
            <small>QUIZ CHECKPOINTS</small>
          </div>
        </div>
        <ul className='rules'>
          <li>
            <b>Win:</b> collect {m.target} medicines before time runs out and
            while you still have health.
          </li>
          <li>
            <b>Lose:</b> health reaches zero, or the {mmss(m.timeLimit)}{' '}
            deadline passes first.
          </li>
          <li>
            Quizzes appear around {m.quizAt.map(mmss).join(', ')}. The run timer
            pauses while you answer. Finishing early skips the remaining
            quizzes.
          </li>
          <li>
            Each hit costs 20 health. A correct answer heals 20, a wrong one
            costs 10.
          </li>
          <li>
            Rewards up to {m.reward.xp} XP and {m.reward.coins} 🪙, validated by
            the server.
          </li>
        </ul>
        {brand && (
          <div className='pat' style={{ borderColor: brand.color }}>
            <b>Sponsored collectibles:</b> {brand.label} — {brand.sponsor}
            <br />
            <small>{brand.disclosure}</small>
          </div>
        )}
        {error && <Notice>{error}</Notice>}
        <div className='row'>
          <Btn
            className='btn big'
            style={{ padding: '14px 34px', fontSize: 17 }}
            disabled={starting}
            onClick={onStart}
          >
            {starting ? 'Starting…' : '▶ Start mission'}
          </Btn>
          <Btn
            className='btn ghost'
            onClick={() => go(challengeId ? 'leaderboard' : 'missions')}
          >
            ← Back
          </Btn>
        </div>
      </div>
    </Panel>
  )
}
