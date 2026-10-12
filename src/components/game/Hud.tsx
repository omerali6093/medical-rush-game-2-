import { motion } from 'framer-motion'
import type { HudState, Profile } from '../../types'
import type { Brand } from '../../api/types'
import type { Action } from '../../engine/GameEngine'
import type { FloatText } from '../../hooks/useGameFlow'
import Ring from '../ui/Ring'
import { Btn, Panel } from '../ui/motion'

interface Props {
  hud: HudState
  floats: FloatText[]
  banner: { id: number; text: string } | null
  profile: Profile
  brand: Brand | null
  act: (a: Action) => void
  togglePause: () => void
}
const PAD: [Action, string][] = [
  ['l', '◀'],
  ['r', '▶'],
  ['u', '▲'],
  ['d', '▼']
]
const mmss = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function Hud ({
  hud,
  floats,
  banner,
  profile,
  brand,
  act,
  togglePause
}: Props) {
  const urgent = hud.time <= 15 && hud.state === 'RUNNING'
  return (
    <>
      <Panel id='hud'>
        <div className='top'>
          <span
            id='hrt'
            style={{
              ['--hr' as string]: `${0.35 + (hud.hp / hud.maxHp) * 0.6}s`
            }}
          >
            ❤️
          </span>
          <div className='bar'>
            <motion.i
              initial={false}
              animate={{ width: `${Math.max(0, (hud.hp / hud.maxHp) * 100)}%` }}
              transition={{ type: 'spring', stiffness: 140, damping: 20 }}
              style={{ transition: 'none' }}
            />
          </div>
          <div
            id='tmr'
            className={urgent ? 'urgent' : ''}
            aria-label='Time remaining'
          >
            {mmss(hud.time)}
          </div>
          <Btn
            className='btn ghost'
            style={{ padding: '8px 14px', pointerEvents: 'auto' }}
            onClick={togglePause}
            aria-label='Pause'
          >
            ⏸
          </Btn>
        </div>
        <div id='big'>
          <motion.b
            key={Math.floor(hud.score / 100)}
            initial={{ scale: 1.3, color: '#22e4ff' }}
            animate={{ scale: 1, color: '#ffffff' }}
            transition={{ type: 'spring', stiffness: 300, damping: 15 }}
            style={{ display: 'inline-block' }}
          >
            {hud.score}
          </motion.b>
        </div>
        <div className='stats glass'>
          <span>
            <small>OBJECTIVE</small>
            <b>
              💊 {hud.pills}/{hud.target}
            </b>
          </span>
          <span>
            <small>DISTANCE</small>
            <b>{hud.dist}m</b>
          </span>
          <span>
            <small>HEALTH</small>
            <b>{hud.hp}</b>
          </span>
        </div>
        <div className='obj'>
          <motion.i
            animate={{
              width: `${Math.min(
                100,
                (hud.pills / Math.max(1, hud.target)) * 100
              )}%`
            }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
        </div>
        <div id='stk'>
          {hud.streak >= 5 && (
            <motion.span
              key={hud.streak}
              initial={{ scale: 1.5 }}
              animate={{ scale: 1 }}
              style={{ display: 'inline-block' }}
            >
              🔥 STREAK x{hud.streak}
            </motion.span>
          )}
        </div>
        {brand && (
          <div className='sponsor chip glass'>Sponsored · {brand.sponsor}</div>
        )}
        <div id='pw'>
          <Ring label='🛡' percent={100} hidden={!hud.shield} />
          <Ring
            label='✨'
            percent={(hud.mult / 8) * 100}
            hidden={hud.mult <= 0}
          />
        </div>
      </Panel>
      <div
        id='low'
        style={{
          opacity:
            hud.hp / hud.maxHp < 0.3 ? (1 - hud.hp / hud.maxHp / 0.3) * 0.85 : 0
        }}
      />
      {banner && (
        <div id='ban'>
          <motion.div
            key={banner.id}
            initial={{ opacity: 0, x: -60 }}
            animate={{ opacity: [0, 1, 1, 0], x: [-60, 0, 0, 60] }}
            transition={{ duration: 2.4, times: [0, 0.15, 0.8, 1] }}
          >
            {banner.text}
          </motion.div>
        </div>
      )}
      {hud.count !== null && (
        <div id='cd' className='on'>
          <motion.span
            key={hud.count}
            initial={{ scale: 2.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            {hud.count > 0 ? hud.count : 'GO!'}
          </motion.span>
        </div>
      )}
      {hud.count !== null && hud.dist < 5 && (
        <div id='hint'>← → switch lanes · ↑ jump · ↓ slide (or swipe)</div>
      )}
      {floats.map(f => (
        <div
          key={f.id}
          className='ft'
          style={{ left: f.x, top: f.y, color: f.c }}
        >
          <motion.div
            initial={{ y: 0, opacity: 1, scale: 0.8 }}
            animate={{ y: -130, opacity: 0, scale: 1.4 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            {f.t}
          </motion.div>
        </div>
      ))}
      {profile.padOn && (
        <div id='pad' style={{ display: 'block' }}>
          {PAD.map(([a, l]) => (
            <Btn key={a} data-a={a} onPointerDown={() => act(a)}>
              {l}
            </Btn>
          ))}
        </div>
      )}
    </>
  )
}
