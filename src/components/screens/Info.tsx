import { useState } from 'react'
import { api, errMsg } from '../../api/client'
import type { Progress, User } from '../../api/types'
import type { Screen } from '../../types'
import { SKINS } from '../../data/config'
import { SHOP } from '../../../shared/rules'
import { useAuth } from '../../store/auth'
import { useProfile } from '../../store/profile'
import { Btn, Panel } from '../ui/motion'
import { Input, Notice } from '../ui/forms'

export function ProfileScreen ({ go }: { go: (s: Screen) => void }) {
  const { user, progress, setProgress, setUser, logout } = useAuth()
  const { profile, patch } = useProfile()
  const [name, setName] = useState(user?.displayName || ''),
    [msg, setMsg] = useState(''),
    [err, setErr] = useState(''),
    [del, setDel] = useState(false),
    [pw, setPw] = useState('')
  const run = async (fn: () => Promise<void>, ok = '') => {
    setErr('')
    setMsg('')
    try {
      await fn()
      setMsg(ok)
    } catch (e) {
      setErr(errMsg(e))
    }
  }
  if (!user || !progress) return null
  const owned = (id: string | null) =>
    id === null || progress.inventory.includes(id)
  return (
    <Panel id='profile' top>
      <h2>Profile</h2>
      <div className='card glass form'>
        <div className='lb'>
          <div className='nm'>
            {user.email}
            <br />
            <em>
              {user.profession} · {user.role}
            </em>
          </div>
          <div>Lv {progress.level}</div>
        </div>
        <Input
          label='Display name'
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={30}
        />
        <Btn
          className='btn'
          onClick={() =>
            run(async () => {
              const r = await api<{ user: User }>('/me', {
                method: 'PATCH',
                body: { displayName: name }
              })
              setUser(r.user)
            }, 'Saved')
          }
        >
          Save name
        </Btn>
        <div className='tag'>Doctor skins · 🪙 {progress.coins}</div>
        <div className='row'>
          {SKINS.map((k, i) => {
            const item = SHOP.find(s => s.id === k.shopId)
            return owned(k.shopId) ? (
              <Btn
                key={k.name}
                className={`btn ${profile.skin === i ? '' : 'ghost'}`}
                onClick={() => patch({ skin: i })}
              >
                {k.name}
              </Btn>
            ) : (
              <Btn
                key={k.name}
                className='btn ghost'
                disabled={progress.coins < (item?.price ?? 0)}
                onClick={() =>
                  run(async () => {
                    const r = await api<{ progress: Progress }>(
                      '/rewards/spend',
                      { body: { itemId: k.shopId } }
                    )
                    setProgress(r.progress)
                    patch({ skin: i })
                  }, `${k.name} unlocked`)
                }
              >
                🔒 {k.name} · {item?.price} 🪙
              </Btn>
            )
          })}
        </div>
        {msg && <Notice kind='ok'>{msg}</Notice>}
        {err && <Notice>{err}</Notice>}
        <div className='row'>
          <Btn
            className='btn ghost'
            onClick={() => {
              void logout()
              go('home')
            }}
          >
            Sign out
          </Btn>
          <Btn className='btn ghost' onClick={() => setDel(d => !d)}>
            Delete account…
          </Btn>
        </div>
        {del && (
          <>
            <div className='pat' style={{ borderColor: 'var(--pk)' }}>
              This permanently deletes your profile, progress, history and quiz
              attempts.
            </div>
            <Input
              label='Confirm with your password'
              type='password'
              value={pw}
              onChange={e => setPw(e.target.value)}
            />
            <Btn
              className='btn'
              style={{ borderColor: 'var(--pk)' }}
              onClick={() =>
                run(async () => {
                  await api('/me', { method: 'DELETE', body: { password: pw } })
                  await logout()
                  go('home')
                })
              }
            >
              Delete everything
            </Btn>
          </>
        )}
      </div>
      <Btn className='btn ghost' onClick={() => go('home')}>
        ← Back
      </Btn>
    </Panel>
  )
}
