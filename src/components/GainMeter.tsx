import { useEffect, useRef } from 'react'
import { useStore } from '../store'

const BAR_HEIGHT = 52
// Smoothing coefficients per animation frame (~16ms at 60fps).
// Attack is fast so transients register immediately.
// Release is slower to give a smooth fall-off without flicker.
const ATTACK = 0.9
const RELEASE = 0.18

interface MeterBarProps {
  label: string
  fillRef: React.RefObject<HTMLDivElement | null>
}

function MeterBar({ label, fillRef }: MeterBarProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
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
        {/* fill bar — height driven directly by the rAF loop, no React re-renders */}
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
        {/* clipping threshold line */}
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
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--shade3)', lineHeight: 1 }}>
        {label}
      </span>
    </div>
  )
}

interface GainMeterProps {
  moduleId: string
}

export function GainMeter({ moduleId }: GainMeterProps) {
  const fillLRef = useRef<HTMLDivElement | null>(null)
  const fillRRef = useRef<HTMLDivElement | null>(null)
  // current displayed (smoothed) values
  const displayRef = useRef({ l: 0, r: 0 })
  // target values updated from the store without triggering re-renders
  const targetRef = useRef({ l: 0, r: 0 })

  // Subscribe to the store directly — no re-renders, just ref updates
  useEffect(() => {
    return useStore.subscribe((state) => {
      targetRef.current.l = state.meterValues[`${moduleId}:peakL`] ?? 0
      targetRef.current.r = state.meterValues[`${moduleId}:peakR`] ?? 0
    })
  }, [moduleId])

  // rAF loop: smooth display values toward targets, update DOM directly
  useEffect(() => {
    let rafId: number

    const animate = () => {
      const { l: tL, r: tR } = targetRef.current
      let { l: cL, r: cR } = displayRef.current

      cL += (tL - cL) * (tL > cL ? ATTACK : RELEASE)
      cR += (tR - cR) * (tR > cR ? ATTACK : RELEASE)

      displayRef.current.l = cL
      displayRef.current.r = cR

      const fillL = fillLRef.current
      if (fillL) {
        const h = Math.round(Math.min(1, cL) * BAR_HEIGHT)
        fillL.style.height = `${h}px`
        fillL.style.background = cL > 0.9 ? 'var(--accent2)' : 'var(--accent1)'
      }

      const fillR = fillRRef.current
      if (fillR) {
        const h = Math.round(Math.min(1, cR) * BAR_HEIGHT)
        fillR.style.height = `${h}px`
        fillR.style.background = cR > 0.9 ? 'var(--accent2)' : 'var(--accent1)'
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
        gap: 6,
        alignItems: 'flex-end',
        padding: '4px 6px',
      }}
    >
      <MeterBar label="L" fillRef={fillLRef} />
      <MeterBar label="R" fillRef={fillRRef} />
    </div>
  )
}
