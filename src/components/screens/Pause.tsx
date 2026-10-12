import { Btn, Panel, ITEM } from '../ui/motion'
import { motion } from 'framer-motion'
import type { Profile, Screen } from '../../types'
import MuteButton from '../ui/MuteButton'

interface Props {
  go: (s: Screen) => void
  togglePause: () => void
  profile: Profile
  patch: (p: Partial<Profile>) => void
}
export default function Pause ({ go, togglePause, profile, patch }: Props) {
  return (
    <Panel id='pause' style={{ background: '#020812cc', zIndex: 5 }}>
      <h2>Paused</h2>
      <Btn className='btn big' onClick={togglePause}>
        Resume
      </Btn>
      <MuteButton />
      <Btn
        className='btn ghost'
        onClick={() => patch({ padOn: !profile.padOn })}
      >
        🎮 Buttons: {profile.padOn ? 'on' : 'off'}
      </Btn>
      <Btn className='btn ghost' onClick={() => go('home')}>
        Quit
      </Btn>
    </Panel>
  )
}
