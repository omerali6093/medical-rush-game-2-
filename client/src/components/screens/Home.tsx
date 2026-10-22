import { motion } from 'framer-motion'
import { Btn, Panel } from '../ui/motion'
import type { Screen } from '../../types'
import { useAuth } from '../../store/auth'
import Ring from '../ui/Ring'
import MuteButton from '../ui/MuteButton'
import logo from '../../../assets/gg-logo.png'

export default function Home ({
  go,
  playNext
}: {
  go: (s: Screen) => void
  playNext: () => void
}) {
  const { user, progress, logout } = useAuth()
  return (
    <Panel id='home'>
      <motion.h1
        animate={{ y: [0, -6, 0] }}
        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
      >
        <img src={logo} alt='GetGoal logo' className='logo' />
      </motion.h1>
      <div className='tag' style={{ color: 'var(--cy)' }}>
        Race Through the Human Body
      </div>
      {user && progress ? (
        <>
          <div className='row push' style={{ alignItems: 'center' }}>
            <Ring
              id='hlr'
              label={String(progress.level)}
              percent={(progress.xpIntoLevel / progress.xpForNext) * 100}
            />
            <div className='glass chip'>
              ⭐ XP <b>{progress.xp}</b>
            </div>
            <div className='glass chip'>
              🪙 <b>{progress.coins}</b>
            </div>
            <div className='glass chip'>
              🏆 Best <b>{progress.personalBest}</b>
            </div>
          </div>
          <div className='glass strip'>
            Welcome back, <b>{user.displayName}</b> · Level{' '}
            {progress.unlockedLevel} unlocked
          </div>
          <Btn className='btn big' onClick={playNext}>
            ▶ PLAY NOW
          </Btn>
          <div className='row'>
            <Btn className='btn ghost' onClick={() => go('worlds')}>
              🌍 Worlds
            </Btn>
            <Btn className='btn ghost' onClick={() => go('missions')}>
              🎯 Missions
            </Btn>
            <Btn className='btn ghost' onClick={() => go('dashboard')}>
              📊 Dashboard
            </Btn>
            <Btn className='btn ghost' onClick={() => go('leaderboard')}>
              🏆 Challenges
            </Btn>
            <Btn className='btn ghost' onClick={() => go('profile')}>
              👤 Profile
            </Btn>
            {user.role !== 'player' && (
              <Btn className='btn ghost' onClick={() => go('admin')}>
                🛠 Admin
              </Btn>
            )}
            <MuteButton />
            <Btn className='btn ghost' onClick={() => void logout()}>
              Sign out
            </Btn>
          </div>
        </>
      ) : (
        <>
          <div className='glass strip push'>
            Timed 3-minute missions, medical quiz checkpoints, doctor
            challenges. Sign in to save progress on any device.
          </div>
          <Btn className='btn big' onClick={() => go('auth')}>
            Sign in / Sign up
          </Btn>
          <div className='row'>
            <MuteButton />
          </div>
        </>
      )}
    </Panel>
  )
}
