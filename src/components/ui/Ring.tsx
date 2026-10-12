import type { CSSProperties } from 'react'
/** Circular progress badge (conic-gradient). `percent` 0–100. */
export default function Ring ({
  id,
  label,
  percent,
  hidden
}: {
  id?: string
  label: string
  percent: number
  hidden?: boolean
}) {
  return (
    <div
      id={id}
      className='ring'
      data-t={label}
      style={
        { '--p': percent, display: hidden ? 'none' : 'grid' } as CSSProperties
      }
    />
  )
}
