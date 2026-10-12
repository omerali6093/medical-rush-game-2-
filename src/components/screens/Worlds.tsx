import { Btn, Panel, ITEM } from '../ui/motion'
import { motion } from 'framer-motion'
import type { Screen } from '../../types'
import { WORLDS } from '../../data/worlds'
import { levelOfXp } from '../../../shared/rules'

export default function Worlds ({
  go,
  xp
}: {
  go: (s: Screen) => void
  xp: number
}) {
  const lv = levelOfXp(xp)
  return (
    <Panel id='worlds'>
      <h2>Select World</h2>
      <div className='grid' id='wgrid'>
        {WORLDS.map((w, i) => {
          const open = w.level === 1
          return (
            <motion.div
              key={w.name}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, type: 'spring' }}
              whileHover={open ? { y: -8, scale: 1.03 } : undefined}
              className={`world ${open ? '' : 'locked'}`}
              style={{ background: w.gradient }}
              onClick={() => open && go('missions')}
            >
              <span className='ic'>{w.icon}</span>
              <i>{w.specialty}</i>
              <b>{w.name}</b>
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
