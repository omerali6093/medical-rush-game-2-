import {
  useEffect,
  useState,
  type InputHTMLAttributes,
  type ReactNode
} from 'react'
import { api, errMsg } from '../../api/client'

/** GET helper with loading / error / reload state. */
export function useLoad<T> (path: string | null) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(!!path),
    [tick, setTick] = useState(0)
  useEffect(() => {
    if (!path) return
    let live = true
    setLoading(true)
    setError('')
    api<T>(path)
      .then(d => live && setData(d))
      .catch(e => live && setError(errMsg(e)))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [path, tick])
  return { data, error, loading, reload: () => setTick(t => t + 1) }
}
export const Field = ({
  label,
  children
}: {
  label: string
  children: ReactNode
}) => (
  <label className='field'>
    <span>{label}</span>
    {children}
  </label>
)
export const Input = (
  p: InputHTMLAttributes<HTMLInputElement> & { label: string }
) => {
  const { label, ...rest } = p
  return (
    <Field label={label}>
      <input {...rest} />
    </Field>
  )
}
export const Notice = ({
  kind = 'err',
  children
}: {
  kind?: 'err' | 'ok'
  children: ReactNode
}) => (
  <div className={`notice ${kind}`} role={kind === 'err' ? 'alert' : 'status'}>
    {children}
  </div>
)
export const Stars = ({ n }: { n: number }) => (
  <span>
    {'⭐'.repeat(n)}
    {'☆'.repeat(3 - n)}
  </span>
)
