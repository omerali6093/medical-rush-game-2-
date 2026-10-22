import { useEffect, useRef } from 'react'

/** Animated ECG trace whose rhythm follows the patient's heart rate. */
export default function Ecg ({ hr }: { hr: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current!.getContext('2d')!
    let raf = 0
    const draw = (t: number) => {
      ctx.clearRect(0, 0, 480, 70)
      ctx.strokeStyle = '#22e4ff'
      ctx.shadowColor = '#22e4ff'
      ctx.shadowBlur = 8
      ctx.lineWidth = 2
      ctx.beginPath()
      for (let x = 0; x < 480; x++) {
        const p = ((((x / 480) * 3 - ((t / 1000) * hr) / 120) % 1) + 1) % 1,
          y = 38 - (p < 0.12 ? Math.sin((p / 0.12) * Math.PI) * 30 : 0)
        x ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
      }
      ctx.stroke()
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [hr])
  return (
    <canvas
      ref={ref}
      width={480}
      height={70}
      style={{
        width: '100%',
        height: 70,
        borderRadius: 12,
        background: '#02101a',
        border: '1px solid var(--ln)'
      }}
    />
  )
}
