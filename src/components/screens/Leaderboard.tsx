import { useState } from 'react'
import { api, errMsg } from '../../api/client'
import type { ChallengeInfo, Standing } from '../../api/types'
import type { Screen } from '../../types'
import { useAuth } from '../../store/auth'
import { Btn, Panel } from '../ui/motion'
import { Notice, useLoad } from '../ui/forms'

type Tab = 'all' | 'weekly' | 'challenges'
const mmss = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const medal = (i: number) => ['🥇', '🥈', '🥉'][i] || i + 1

/** Global / weekly rankings and doctor challenges. Every number shown here was computed and validated on the server. */
export default function Leaderboard ({
  go,
  onPlay
}: {
  go: (s: Screen) => void
  onPlay: (c: ChallengeInfo) => void
}) {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('all'),
    [open, setOpen] = useState<string | null>(null),
    [err, setErr] = useState('')
  const global = useLoad<{
    entries: {
      rank: number
      userId: string
      displayName: string
      score: number
      xp: number
      level: number
    }[]
    me: { rank: number } | null
  }>(tab !== 'challenges' ? `/leaderboards/global?period=${tab}` : null)
  const chs = useLoad<{ challenges: ChallengeInfo[] }>(
    tab === 'challenges' ? '/challenges' : null
  )
  const st = useLoad<{
    challenge: ChallengeInfo
    standings: Standing[]
    frozen: boolean
  }>(open ? `/leaderboards/${open}` : null)
  const join = async (id: string) => {
    setErr('')
    try {
      await api(`/challenges/${id}/join`, { body: {} })
      chs.reload()
    } catch (e) {
      setErr(errMsg(e))
    }
  }

  return (
    <Panel id='lb' top>
      <h2>Leaderboards & challenges</h2>
      <div className='tabs'>
        {(['all', 'weekly', 'challenges'] as Tab[]).map(t => (
          <Btn
            key={t}
            className={`btn ${tab === t ? 'on' : 'ghost'}`}
            onClick={() => {
              setTab(t)
              setOpen(null)
            }}
          >
            {t === 'all' ? 'Global' : t === 'weekly' ? 'Weekly' : 'Challenges'}
          </Btn>
        ))}
      </div>
      {err && <Notice>{err}</Notice>}
      {tab !== 'challenges' && (
        <div className='card glass' style={{ gap: 8 }}>
          {global.loading && <div className='pat'>Loading…</div>}
          {global.error && <Notice>{global.error}</Notice>}
          {global.data?.entries.length === 0 && (
            <div className='pat'>No validated wins yet — be the first!</div>
          )}
          {global.data?.entries.map(r => (
            <div
              key={r.userId}
              className={`lb ${r.userId === user?.id ? 'me' : ''}`}
            >
              <div className='rk'>{medal(r.rank - 1)}</div>
              <div className='nm'>
                {r.displayName}
                <br />
                <em>
                  Lv {r.level} · ⭐ {r.xp} XP
                </em>
              </div>
              <div>{r.score.toLocaleString()}</div>
            </div>
          ))}
          <small className='dim'>
            Best single validated win per player
            {tab === 'weekly' ? ' in the last 7 days' : ''}.
          </small>
        </div>
      )}
      {tab === 'challenges' && !open && (
        <div className='card glass' style={{ gap: 10 }}>
          {chs.loading && <div className='pat'>Loading…</div>}
          {chs.error && <Notice>{chs.error}</Notice>}
          {chs.data?.challenges.length === 0 && (
            <div className='pat'>No challenges yet.</div>
          )}
          {chs.data?.challenges.map(c => (
            <div key={c.id} className='chal'>
              <div>
                <b>{c.title}</b>
                <br />
                <small className='dim'>
                  {c.missionTitle} · {c.status} · {c.participantCount}/
                  {c.maxParticipants} doctors · {c.maxAttempts} attempts · ends{' '}
                  {new Date(c.endsAt).toLocaleString()}
                </small>
              </div>
              <div className='row'>
                {c.status === 'open' && !c.joined && (
                  <Btn className='btn' onClick={() => join(c.id)}>
                    Join
                  </Btn>
                )}
                {c.status === 'open' && c.joined && (
                  <Btn className='btn' onClick={() => onPlay(c)}>
                    ▶ Play
                  </Btn>
                )}
                <Btn className='btn ghost' onClick={() => setOpen(c.id)}>
                  Standings
                </Btn>
              </div>
            </div>
          ))}
        </div>
      )}
      {tab === 'challenges' && open && (
        <div className='card glass' style={{ gap: 8 }}>
          {st.loading && <div className='pat'>Loading…</div>}
          {st.error && <Notice>{st.error}</Notice>}
          {st.data && (
            <>
              <h3>
                {st.data.challenge.title}{' '}
                {st.data.frozen && <small>· final results</small>}
              </h3>
              {st.data.challenge.winners && (
                <div className='pat' style={{ borderColor: '#ffd24d' }}>
                  🏆 Winners:{' '}
                  {st.data.challenge.winners.map(w => w.displayName).join(', ')}
                </div>
              )}
              {st.data.standings.map(r => (
                <div
                  key={r.userId}
                  className={`lb ${r.userId === user?.id ? 'me' : ''}`}
                >
                  <div className='rk'>{medal(r.rank - 1)}</div>
                  <div className='nm'>
                    {r.displayName}
                    <br />
                    <em>
                      {r.outcome === 'won'
                        ? `⏱ ${mmss(r.activeSeconds)}`
                        : `💊 ${r.pills}`}{' '}
                      · quiz {r.quizCorrect} · hits {r.collisions}
                    </em>
                  </div>
                  <div>{r.score}</div>
                </div>
              ))}
              {st.data.standings.length === 0 && (
                <div className='pat'>No validated attempts yet.</div>
              )}
              <details>
                <summary>Ranking & tie-break rules</summary>
                <ol className='rules'>
                  {st.data.challenge.rules.map(r => (
                    <li key={r}>{r}</li>
                  ))}
                </ol>
              </details>
            </>
          )}
          <Btn className='btn ghost' onClick={() => setOpen(null)}>
            ← Challenges
          </Btn>
        </div>
      )}
      <Btn className='btn ghost' onClick={() => go('home')}>
        ← Back
      </Btn>
    </Panel>
  )
}
