import { motion } from 'framer-motion'
import type { MissionInfo } from '../../api/types'
import type { Screen } from '../../types'
import { Btn, Panel } from '../ui/motion'
import { Notice, Stars, useLoad } from '../ui/forms'

const DIFF = ['', 'Student', 'Resident', 'Specialist']
export default function Missions ({
  go,
  onPick
}: {
  go: (s: Screen) => void
  onPick: (m: MissionInfo) => void
}) {
  const { data, error, loading } = useLoad<{
    missions: MissionInfo[]
    unlockedLevel: number
  }>('/missions')
  return (
    <Panel id='missions' top>
      <h2>🩸 Bloodstream missions</h2>
      {loading && <div className='pat'>Loading…</div>}
      {error && <Notice>{error}</Notice>}
      <div className='mlist'>
        {data?.missions.map((m, i) => (
          <motion.button
            key={m.id}
            className={`mcard glass ${m.locked ? 'locked' : ''}`}
            disabled={m.locked}
            onClick={() => onPick(m)}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            whileHover={m.locked ? undefined : { y: -4 }}
            whileTap={m.locked ? undefined : { scale: 0.98 }}
          >
            <div className='lvl'>
              {m.locked ? '🔒' : m.completed ? '✅' : m.level}
            </div>
            <div className='meta'>
              <b>{m.title}</b>
              <small>
                Collect {m.target} · {Math.floor(m.timeLimit / 60)}:00 ·{' '}
                {DIFF[m.difficulty]}
              </small>
              <small>
                {m.locked ? (
                  'Complete the previous mission to unlock'
                ) : m.attempts ? (
                  <>
                    Best {m.bestScore} · <Stars n={m.bestStars || 0} />
                  </>
                ) : (
                  `Reward up to ${m.reward.xp} XP · ${m.reward.coins} 🪙`
                )}
              </small>
            </div>
          </motion.button>
        ))}
      </div>
      <Btn className='btn ghost' onClick={() => go('home')}>
        ← Back
      </Btn>
    </Panel>
  )
}
