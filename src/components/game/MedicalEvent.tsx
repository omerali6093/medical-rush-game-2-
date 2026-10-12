import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { AttemptResult } from '../../api/types'
import type { QuizState } from '../../hooks/useGameFlow'
import { errMsg } from '../../api/client'
import { sfx } from '../../engine/audio'
import { Btn, EASE } from '../ui/motion'
import Ecg from './Ecg'

interface Props {
  quiz: QuizState
  onRetry: () => void
  onContinue: (correct: boolean) => void
  onAnswer: (selected: number, ms: number) => Promise<AttemptResult>
}

/** Quiz checkpoint. The run is paused by the state machine; the question comes from the server (never with its answer) and the answer is recorded server-side. */
export default function MedicalEvent ({
  quiz,
  onRetry,
  onContinue,
  onAnswer
}: Props) {
  const q = quiz.data
  const total = q?.seconds ?? 12
  const [left, setLeft] = useState(total)
  const [picked, setPicked] = useState<number | null>(null)
  const [res, setRes] = useState<AttemptResult | null>(null)
  const [err, setErr] = useState('')
  const doneRef = useRef(false),
    t0 = useRef(0)

  useEffect(() => {
    if (q) {
      doneRef.current = false
      t0.current = performance.now()
      setLeft(q.seconds)
      setPicked(null)
      setRes(null)
      setErr('')
    }
  }, [q?.id]) // eslint-disable-line

  const choose = async (j: number) => {
    if (doneRef.current || !q) return
    doneRef.current = true
    setPicked(j)
    setErr('')
    try {
      const r = await onAnswer(j, Math.round(performance.now() - t0.current))
      setRes(r)
      sfx(r.correct ? 880 : 150, 0.25, r.correct ? 'sine' : 'square')
    } catch (e) {
      setErr(errMsg(e))
      doneRef.current = false
      setPicked(null)
    }
  }
  useEffect(() => {
    if (!q || doneRef.current) return
    const id = setInterval(
      () =>
        setLeft(l => {
          if (l <= 0.1) {
            clearInterval(id)
            queueMicrotask(() => choose(-1))
            return 0
          }
          return l - 0.1
        }),
      100
    )
    return () => clearInterval(id)
  }) // eslint-disable-line
  const urgent = left / total < 0.3 && !res

  return (
    <motion.section
      id='event'
      className='screen active'
      style={{ background: '#020812b0', zIndex: 6 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className='card glass'
        initial={{ y: 80, scale: 0.9, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 22 }}
      >
        <div className='tag' style={{ textAlign: 'left' }}>
          🩺 Medical checkpoint · run paused
        </div>
        {!q && !quiz.error && <div className='pat'>Loading checkpoint…</div>}
        {quiz.error && (
          <>
            <div className='pat' style={{ borderColor: 'var(--pk)' }}>
              {quiz.error}
            </div>
            <Btn className='btn' onClick={onRetry}>
              Try again
            </Btn>
          </>
        )}
        {q && (
          <>
            {q.vitals && (
              <>
                <Ecg hr={q.vitals.hr} />
                <div
                  className='row'
                  style={{
                    justifyContent: 'space-between',
                    fontWeight: 800,
                    fontSize: 13,
                    color: '#8ff'
                  }}
                >
                  <span>❤ {q.vitals.hr} bpm</span>
                  <span>BP {q.vitals.bp}</span>
                  <span>SpO₂ {q.vitals.spo2}%</span>
                </div>
              </>
            )}
            <div className='bar' style={{ height: 8 }}>
              <motion.i
                animate={{
                  width: `${(left / total) * 100}%`,
                  backgroundColor: urgent ? '#ff3d6e' : '#22e4ff'
                }}
                transition={{ duration: 0.1, ease: 'linear' }}
                style={{
                  transition: 'none',
                  boxShadow: '0 0 10px currentColor'
                }}
              />
            </div>
            <div className='pat'>{q.scenario}</div>
            <h3 style={{ fontSize: 18 }}>{q.question}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {q.options.map((o, j) => {
                const wrong = !!res && picked === j && j !== res.correctIndex,
                  right = !!res && j === res.correctIndex
                return (
                  <Btn
                    key={o}
                    className={`opt ${right ? 'ok' : ''} ${wrong ? 'no' : ''}`}
                    onClick={() => choose(j)}
                    disabled={picked !== null}
                    initial={{ opacity: 0, x: -24 }}
                    animate={
                      wrong
                        ? { opacity: 1, x: [0, -9, 9, -5, 0] }
                        : right
                        ? { opacity: 1, x: 0, scale: [1, 1.04, 1] }
                        : { opacity: 1, x: 0 }
                    }
                    transition={
                      res
                        ? { duration: 0.45 }
                        : { delay: 0.15 + j * 0.09, ease: EASE }
                    }
                    whileHover={res ? undefined : { x: 6, scale: 1 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    {String.fromCharCode(65 + j)}. {o}
                  </Btn>
                )
              })}
            </div>
            {err && (
              <div className='pat' style={{ borderColor: 'var(--pk)' }}>
                {err} — tap an answer to retry.
              </div>
            )}
            <AnimatePresence>
              {res && (
                <motion.div
                  key='fb'
                  className='pat'
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  style={{ overflow: 'hidden' }}
                >
                  {res.correct
                    ? `✅ Correct! +20 HP. `
                    : `${
                        res.timedOut ? '⏱ Time up! ' : '❌ Incorrect. '
                      }−10 HP. `}
                  {res.explanation}
                  <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
                    Educational content, not clinical advice.
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {res && (
              <Btn
                className='btn'
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => onContinue(res.correct)}
              >
                {quiz.index === 2 ? 'Finish mission →' : 'Resume run →'}
              </Btn>
            )}
          </>
        )}
      </motion.div>
    </motion.section>
  )
}
