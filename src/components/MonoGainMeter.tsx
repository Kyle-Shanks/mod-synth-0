import { useEffect, useRef } from 'react'
import { useStore } from '../store'

const BAR_HEIGHT = 52
const ATTACK = 0.9
const RELEASE = 0.18

interface MonoGainMeterProps {
  moduleId: string
  portId: string
  label?: string
}

export function MonoGainMeter({
  moduleId,
  portId,
  label = 'out',
}: MonoGainMeterProps) {
  const fillRef = useRef<HTMLDivElement | null>(null)
  const displayRef = useRef(0)
  const targetRef = useRef(0)

  useEffect(() => {
    return useStore.subscribe((state) => {
      targetRef.current = state.meterValues[`${moduleId}:${portId}`] ?? 0
    })
  }, [moduleId, portId])

  useEffect(() => {
    let rafId: number

    const animate = () => {
      const target = targetRef.current
      let current = displayRef.current
      current += (target - current) * (target > current ? ATTACK : RELEASE)
      displayRef.current = current

      const fill = fillRef.current
      if (fill) {
        const h = Math.round(Math.min(1, current) * BAR_HEIGHT)
        fill.style.height = `${h}px`
        fill.style.background =
          current > 0.9 ? 'var(--accent2)' : 'var(--accent1)'
      }

      rafId = requestAnimationFrame(animate)
    }

    rafId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId)
  }, [])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
      }}
    >
      <div
        style={{
          width: 12,
          height: BAR_HEIGHT,
          background: 'var(--shade0)',
          border: '1px solid var(--shade2)',
          borderRadius: 1,
          position: 'relative',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <div
          ref={fillRef}
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 0,
            background: 'var(--accent1)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: Math.round(0.9 * BAR_HEIGHT),
            left: 0,
            right: 0,
            height: 1,
            background: 'var(--accent2)',
            opacity: 0.5,
          }}
        />
      </div>
      <span
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--shade3)',
          lineHeight: 1,
        }}
      >
        {label}
      </span>
    </div>
  )
}
