import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import type { ResultState } from '../../hooks/useGameFlow'
import type { Screen } from '../../types'
import { ACHIEVEMENTS } from '../../../../shared/rules'
import { Btn, ITEM, Panel, STAGGER } from '../ui/motion'

function useCountUp (target: number, ms = 900) {
  const [v, setV] = useState(0)
  useEffect(() => {
    const t0 = performance.now()
    let raf = 0
    const f = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      setV(Math.round(target * k))
      if (k < 1) raf = requestAnimationFrame(f)
    }
    raf = requestAnimationFrame(f)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}
const Stat = ({
  label,
  value,
  prefix = '',
  suffix = ''
}: {
  label: string
  value: number
  prefix?: string
  suffix?: string
}) => {
  const v = useCountUp(value)
  return (
    <motion.div variants={ITEM}>
      <b>
        {prefix}
        {v}
        {suffix}
      </b>
      <small>{label}</small>
    </motion.div>
  )
}
const mmss = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

interface Props {
  result: ResultState
  go: (s: Screen) => void
  onRetry: () => void
  onNext: (missionId: string) => void
  onResubmit: () => void
}
export default function Results ({
  result,
  go,
  onRetry,
  onNext,
  onResubmit
}: Props) {
  if (result.status === 'saving')
    return (
      <Panel id='results'>
        <div className='card glass'>
          <h2 style={{ textAlign: 'center' }}>Verifying your run…</h2>
          <div className='pat'>
            The server is validating your result and calculating rewards.
          </div>
        </div>
      </Panel>
    )
  if (result.status === 'error')
    return (
      <Panel id='results'>
        <div className='card glass'>
          <h2 style={{ textAlign: 'center' }}>Result not saved</h2>
          <div className='pat' style={{ borderColor: 'var(--pk)' }}>
            {result.message}
          </div>
          <div className='row'>
            {result.retryable && (
              <Btn
                className='btn big'
                style={{ padding: '14px 34px', fontSize: 17 }}
                onClick={onResubmit}
              >
                Retry saving
              </Btn>
            )}
            <Btn className='btn' onClick={onRetry}>
              ↻ New attempt
            </Btn>
            <Btn className='btn ghost' onClick={() => go('dashboard')}>
              Dashboard
            </Btn>
          </div>
        </div>
      </Panel>
    )
  const r = result.data,
    won = r.outcome === 'won'
  const why = won
    ? ''
    : r.reason === 'health'
    ? 'Your health reached zero.'
    : 'Time ran out before the objective was completed.'
  return (
    <Panel id='results' top>
      <div className='card glass'>
        <h2 style={{ textAlign: 'center' }}>
          {won
            ? r.newBest
              ? '🎉 Mission complete — new best!'
              : '✅ Mission complete'
            : '❌ Mission failed'}
          <br />
          <span style={{ fontSize: 30 }}>
            {'⭐'.repeat(r.stars)}
            {'☆'.repeat(3 - r.stars)}
          </span>
          {why && (
            <>
              <br />
              <small style={{ color: '#ffb3c6' }}>{why}</small>
            </>
          )}
          {r.levelAfter > r.levelBefore && (
            <>
              <br />
              <small style={{ color: '#ffd24d' }}>
                ⬆ LEVEL UP → {r.levelAfter}
              </small>
            </>
          )}
        </h2>
        <motion.div className='res' initial='h' animate='s' variants={STAGGER}>
          <Stat label='SCORE' value={r.score} />
          <Stat label='XP EARNED' value={r.xp} prefix='+' />
          <Stat label='COINS' value={r.coins} prefix='+' />
          <Stat label='💊 COLLECTED' value={r.pills} />
          <motion.div variants={ITEM}>
            <b>{mmss(r.activeSeconds)}</b>
            <small>RUN TIME</small>
          </motion.div>
          <motion.div variants={ITEM}>
            <b>{r.collisions}</b>
            <small>COLLISIONS</small>
          </motion.div>
          <motion.div variants={ITEM}>
            <b>
              {r.quiz.correct}/{r.quiz.answered}
            </b>
            <small>QUIZ</small>
          </motion.div>
          <motion.div variants={ITEM}>
            <b>
              {r.quiz.answered ? Math.round(r.quiz.accuracy * 100) + '%' : '—'}
            </b>
            <small>ACCURACY</small>
          </motion.div>
        </motion.div>
        {r.unlocked && (
          <div className='pat' style={{ borderColor: '#1edc8c' }}>
            🔓 Unlocked:{' '}
            <b>
              Level {r.unlocked.level} — {r.unlocked.title}
            </b>
          </div>
        )}
        {r.newAchievements.map(k => {
          const a = ACHIEVEMENTS.find(x => x.key === k)
          return (
            a && (
              <div key={k} className='pat' style={{ borderColor: '#ffd24d' }}>
                🏅 <b>{a.title}</b> — {a.desc}
              </div>
            )
          )
        })}
        {r.brandedPills > 0 && r.sponsor && (
          <div className='pat' style={{ fontSize: 12 }}>
            {r.sponsor.disclosure}
          </div>
        )}
        <div className='row'>
          {won && r.nextMissionId && (
            <Btn
              className='btn big'
              style={{ padding: '14px 28px', fontSize: 17 }}
              onClick={() => onNext(r.nextMissionId!)}
            >
              Next level →
            </Btn>
          )}
          <Btn
            className={won && r.nextMissionId ? 'btn' : 'btn big'}
            style={
              won && r.nextMissionId
                ? undefined
                : { padding: '14px 34px', fontSize: 17 }
            }
            onClick={onRetry}
          >
            ↻ {won ? 'Replay' : 'Retry'}
          </Btn>
          <Btn className='btn ghost' onClick={() => go('dashboard')}>
            📊 Dashboard
          </Btn>
        </div>
      </div>
    </Panel>
  )
}
