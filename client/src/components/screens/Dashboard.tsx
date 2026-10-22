import { motion } from 'framer-motion'
import type { Dashboard as D, MissionInfo } from '../../api/types'
import type { Screen } from '../../types'
import { Btn, Panel } from '../ui/motion'
import { Notice, Stars, useLoad } from '../ui/forms'
import Ring from '../ui/Ring'

const mmss = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
export default function Dashboard ({
  go,
  onContinue
}: {
  go: (s: Screen) => void
  onContinue: () => void
}) {
  const { data: d, error, loading } = useLoad<D>('/dashboard')
  const { data: ms } = useLoad<{ missions: MissionInfo[] }>('/missions')
  const p = d?.progress
  return (
    <Panel id='dashboard' top>
      <h2>Player dashboard</h2>
      {loading && <div className='pat'>Loading…</div>}
      {error && <Notice>{error}</Notice>}
      {p && d && (
        <div className='dash'>
          <div
            className='glass card row'
            style={{ alignItems: 'center', justifyContent: 'space-around' }}
          >
            <Ring
              label={String(p.level)}
              percent={(p.xpIntoLevel / p.xpForNext) * 100}
            />
            <div>
              <small className='dim'>LEVEL {p.level}</small>
              <div>
                <b>{p.xpIntoLevel}</b> / {p.xpForNext} XP
              </div>
              <small className='dim'>{p.xp} XP total</small>
            </div>
            <div>
              <small className='dim'>COINS</small>
              <div>
                <b>🪙 {p.coins}</b>
              </div>
            </div>
            <div>
              <small className='dim'>BEST SCORE</small>
              <div>
                <b>{p.personalBest}</b>
              </div>
            </div>
            <Btn className='btn' onClick={onContinue}>
              ▶ Continue
            </Btn>
          </div>
          <div className='glass card'>
            <h3>Statistics</h3>
            <div className='res'>
              <div>
                <b>{p.totals.runs}</b>
                <small>RUNS</small>
              </div>
              <div>
                <b>{p.totals.wins}</b>
                <small>WINS</small>
              </div>
              <div>
                <b>{p.totals.pills}</b>
                <small>💊 COLLECTED</small>
              </div>
              <div>
                <b>{mmss(p.totals.playSeconds)}</b>
                <small>PLAY TIME</small>
              </div>
            </div>
          </div>
          <div className='glass card'>
            <h3>Progression</h3>
            {ms?.missions.map(m => (
              <div key={m.id} className='lb'>
                <div className='rk'>
                  {m.locked ? '🔒' : m.completed ? '✅' : m.level}
                </div>
                <div className='nm'>
                  {m.title}
                  <br />
                  <em>
                    {m.attempts
                      ? `Best ${m.bestScore}`
                      : m.locked
                      ? 'Locked'
                      : 'Not played'}
                  </em>
                </div>
                <Stars n={m.bestStars || 0} />
              </div>
            ))}
          </div>
          <div className='glass card'>
            <h3>Quiz performance</h3>
            <div className='res'>
              <div>
                <b>
                  {d.quiz.answered
                    ? Math.round(d.quiz.accuracy * 100) + '%'
                    : '—'}
                </b>
                <small>ACCURACY</small>
              </div>
              <div>
                <b>
                  {d.quiz.correct}/{d.quiz.answered}
                </b>
                <small>CORRECT</small>
              </div>
            </div>
            {d.quiz.byTopic.map(t => (
              <div key={t.topic} className='topic'>
                <span>{t.topic}</span>
                <div className='bar2'>
                  <motion.i
                    initial={{ width: 0 }}
                    animate={{ width: `${t.accuracy * 100}%` }}
                  />
                </div>
                <small>
                  {t.correct}/{t.answered}
                </small>
              </div>
            ))}
            {d.quiz.answered === 0 && (
              <div className='pat'>Play a mission to see your quiz stats.</div>
            )}
          </div>
          <div className='glass card'>
            <h3>Achievements</h3>
            <div className='ach'>
              {p.achievements.map(a => (
                <div
                  key={a.key}
                  className={`a ${a.earned ? 'on' : ''}`}
                  title={a.desc}
                >
                  <span>{a.earned ? '🏅' : '🔒'}</span>
                  <b>{a.title}</b>
                  <small>{a.desc}</small>
                </div>
              ))}
            </div>
          </div>
          <div className='glass card'>
            <h3>Game history</h3>
            {d.recent.length === 0 && (
              <div className='pat'>No completed runs yet.</div>
            )}
            {d.recent.map(r => (
              <div key={r.id} className='lb'>
                <div className='rk'>{r.outcome === 'won' ? '✅' : '❌'}</div>
                <div className='nm'>
                  L{r.level} {r.mission}
                  <br />
                  <em>{new Date(r.at).toLocaleString()}</em>
                </div>
                <div>{r.score}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <Btn className='btn ghost' onClick={() => go('home')}>
        ← Back
      </Btn>
    </Panel>
  )
}
