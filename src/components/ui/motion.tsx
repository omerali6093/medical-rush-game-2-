import { motion, type HTMLMotionProps } from 'framer-motion'
import type { CSSProperties, ReactNode } from 'react'

export const EASE = [0.22, 1, 0.36, 1] as const
/** Child variants for staggered grids (use with a parent `initial="h" animate="s"`). */
export const ITEM = {
  h: { opacity: 0, scale: 0.6 },
  s: { opacity: 1, scale: 1 }
}
export const STAGGER = { s: { transition: { staggerChildren: 0.08 } } }

/** Spring-driven button: grows on hover, squashes on tap. */
export function Btn (props: HTMLMotionProps<'button'>) {
  return (
    <motion.button
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.93 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      {...props}
    />
  )
}

/** Full-screen panel with enter/exit transition (used inside AnimatePresence). */
export function Panel ({
  id,
  style,
  children,
  top
}: {
  id?: string
  style?: CSSProperties
  children: ReactNode
  top?: boolean
}) {
  return (
    <motion.section
      id={id}
      style={style}
      className={`screen active${top ? ' top' : ''}`}
      initial={{ opacity: 0, y: 28, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -18, scale: 0.98 }}
      transition={{ duration: 0.35, ease: EASE }}
    >
      {children}
    </motion.section>
  )
}
