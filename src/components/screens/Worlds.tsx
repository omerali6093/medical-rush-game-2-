import { Btn, Panel } from '../ui/motion'
import { motion } from 'framer-motion'
import type { Screen } from '../../types'
import type { WorldId } from '../../data/worlds'
import { WORLDS } from '../../data/worlds'
import { levelOfXp } from '../../../shared/rules'

export default function Worlds ({
  go,
  xp,
  onSelectWorld
}: {
  go: (s: Screen) => void
  xp: number
  onSelectWorld: (id: WorldId) => void
}) {
  const lv = levelOfXp(xp)

  // World is unlocked when the player's level meets the requirement.
  // Only the 3 active worlds are shown.
  const isOpen = (level: number) => lv >= level

  const worldDescriptions: Record<string, string> = {
    Bloodstream: 'Navigate the vascular system, dodge pathogens, collect medicines.',
    Heart:       'Run through the cardiac chambers. Answer cardiology questions.',
    Lungs:       'Sprint through the airways. Master pulmonology challenges.'
  }

  return (
    <Panel id='worlds'>
      <h2>Select World</h2>
      <div className='grid' id='wgrid'>
        {WORLDS.map((w, i) => {
          const open = isOpen(w.level)
          return (
            <motion.div
              key={w.name}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, type: 'spring' }}
              whileHover={open ? { y: -8, scale: 1.03 } : undefined}
              className={`world ${open ? '' : 'locked'}`}
              style={{ background: w.gradient }}
              onClick={() => {
                if (!open) return
                onSelectWorld(w.name as WorldId)
                go('missions')
              }}
            >
              <span className='ic'>{w.icon}</span>
              <i>{w.specialty}</i>
              <b>{w.name}</b>
              <small className='world-desc'>
                {worldDescriptions[w.name]}
              </small>
              <small>
                {open
                  ? 'Unlocked · Tap to choose a mission'
                  : `🔒 Reach Level ${w.level}${
                      lv >= w.level ? ' (coming soon)' : ''
                    }`}
              </small>
            </motion.div>
          )
        })}
      </div>
      <Btn className='btn ghost' onClick={() => go('home')}>
        ← Back
      </Btn>
    </Panel>
  )
}
