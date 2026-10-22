import { Btn } from './motion'
import { useProfile } from '../../store/profile'
export default function MuteButton () {
  const { profile, patch } = useProfile()
  return (
    <Btn
      className='btn ghost mt'
      onClick={() => patch({ muted: !profile.muted })}
    >
      {profile.muted ? '🔇' : '🔊'}
    </Btn>
  )
}
