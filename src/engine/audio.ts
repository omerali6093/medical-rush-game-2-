let ctx: AudioContext | null = null
export const audio = { muted: false }
export function sfx (
  freq: number,
  dur = 0.12,
  type: OscillatorType = 'sine',
  vol = 0.08
) {
  if (audio.muted) return
  try {
    ctx =
      ctx || new (window.AudioContext || (window as any).webkitAudioContext)()
    const o = ctx.createOscillator(),
      g = ctx.createGain(),
      t = ctx.currentTime
    o.type = type
    o.frequency.value = freq
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(g)
    g.connect(ctx.destination)
    o.start()
    o.stop(t + dur)
  } catch {
    /* audio unavailable */
  }
}
