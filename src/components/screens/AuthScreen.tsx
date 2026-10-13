import { useState, type FormEvent } from 'react'
import { api, errMsg } from '../../api/client'
import { useAuth } from '../../store/auth'
import { Btn, Panel } from '../ui/motion'
import { Input, Notice } from '../ui/forms'
import type { Screen } from '../../types'

type Mode = 'login' | 'signup' | 'forgot' | 'reset'
const PROFESSIONS = [
  ['doctor', 'Doctor'],
  ['pharmacist', 'Pharmacist'],
  ['nurse', 'Nurse'],
  ['student', 'Medical student'],
  ['other', 'Other']
]

export default function AuthScreen ({
  go,
  initial = 'login'
}: {
  go: (s: Screen) => void
  initial?: Mode
}) {
  const { login, signup } = useAuth()
  const [mode, setMode] = useState<Mode>(initial)
  const [f, setF] = useState({
    email: '',
    password: '',
    displayName: '',
    phone: '',
    profession: 'doctor',
    accept: false,
    token: ''
  })
  const [err, setErr] = useState(''),
    [info, setInfo] = useState(''),
    [busy, setBusy] = useState(false)
  const set =
    (k: string) =>
    (e: { target: { value: string; checked?: boolean; type?: string } }) =>
      setF(p => ({
        ...p,
        [k]: e.target.type === 'checkbox' ? !!e.target.checked : e.target.value
      }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr('')
    setInfo('')
    setBusy(true)
    try {
      if (mode === 'login') {
        await login(f.email, f.password)
        go('home')
      } else if (mode === 'signup') {
        await signup({
          email: f.email,
          password: f.password,
          displayName: f.displayName,
          phone: f.phone,
          profession: f.profession,
          acceptTerms: f.accept
        })
        go('home')
      } else if (mode === 'forgot') {
        const r = await api<{ message: string; devResetToken?: string }>(
          '/auth/forgot-password',
          { body: { email: f.email } }
        )
        setInfo(r.message)
        if (r.devResetToken) {
          setF(p => ({ ...p, token: r.devResetToken! }))
          setMode('reset')
          setInfo(
            'Development mode: reset token filled in for you. Choose a new password.'
          )
        }
      } else {
        await api('/auth/reset-password', {
          body: { token: f.token, password: f.password }
        })
        setMode('login')
        setInfo('Password updated. Please sign in.')
      }
    } catch (x) {
      setErr(errMsg(x))
    } finally {
      setBusy(false)
    }
  }
  const title = {
    login: 'Sign in',
    signup: 'Create your doctor profile',
    forgot: 'Recover access',
    reset: 'Choose a new password'
  }[mode]
  return (
    <Panel id='auth' top>
      <form className='card glass form' onSubmit={submit} noValidate>
        <h2>{title}</h2>
        {mode === 'signup' && (
          <Input
            label='Display name (shown on leaderboards)'
            value={f.displayName}
            onChange={set('displayName')}
            maxLength={30}
            autoComplete='nickname'
            required
          />
        )}
        {mode === 'signup' && (
          <Input
            label='Phone number (up to 11 digits)'
            type='text'
            inputMode='numeric'
            value={f.phone}
            onChange={e =>
              setF(p => ({
                ...p,
                phone: e.target.value.replace(/\D/g, '').slice(0, 11)
              }))
            }
            maxLength={11}
            pattern='[0-9]{1,11}'
            autoComplete='tel'
            required
          />
        )}
        {mode !== 'reset' && (
          <Input
            label='Email'
            type='email'
            value={f.email}
            onChange={set('email')}
            autoComplete='email'
            required
          />
        )}
        {mode === 'reset' && (
          <Input
            label='Reset token'
            value={f.token}
            onChange={set('token')}
            required
          />
        )}
        {mode !== 'forgot' && (
          <Input
            label={
              mode === 'login'
                ? 'Password'
                : 'Password (8+ characters, letters and numbers)'
            }
            type='password'
            value={f.password}
            onChange={set('password')}
            autoComplete={
              mode === 'login' ? 'current-password' : 'new-password'
            }
            required
          />
        )}
        {mode === 'signup' && (
          <>
            <label className='field'>
              <span>Profession</span>
              <select value={f.profession} onChange={set('profession')}>
                {PROFESSIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className='check'>
              <input
                type='checkbox'
                checked={f.accept}
                onChange={set('accept')}
              />{' '}
              <span>
                I accept the privacy notice and terms. I understand this is
                educational gameplay, not clinical advice. No patient data is
                collected.
              </span>
            </label>
          </>
        )}
        {err && <Notice>{err}</Notice>}
        {info && <Notice kind='ok'>{info}</Notice>}
        <Btn
          className='btn big'
          style={{ padding: '14px 24px', fontSize: 17 }}
          type='submit'
          disabled={busy}
        >
          {busy ? 'Please wait…' : title}
        </Btn>
        <div className='row' style={{ fontSize: 13 }}>
          {mode !== 'login' && (
            <button
              type='button'
              className='link'
              onClick={() => {
                setMode('login')
                setErr('')
              }}
            >
              Sign in
            </button>
          )}
          {mode !== 'signup' && (
            <button
              type='button'
              className='link'
              onClick={() => {
                setMode('signup')
                setErr('')
              }}
            >
              Create account
            </button>
          )}
          {mode === 'login' && (
            <button
              type='button'
              className='link'
              onClick={() => {
                setMode('forgot')
                setErr('')
              }}
            >
              Forgot password?
            </button>
          )}
        </div>
        <Btn type='button' className='btn ghost' onClick={() => go('home')}>
          ← Back
        </Btn>
      </form>
    </Panel>
  )
}
