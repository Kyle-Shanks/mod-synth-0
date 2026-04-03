import { useRef, useEffect, useMemo } from 'react'
import { engine } from '../engine/EngineController'

interface ClockIndicatorProps {
  moduleId: string
}

export function ClockIndicator({ moduleId }: ClockIndicatorProps) {
  const gateDotRef = useRef<HTMLDivElement>(null)
  const divDotRef = useRef<HTMLDivElement>(null)

  // create SharedArrayBuffer for 2 Int32 values: [gateHigh, divGateHigh]
  const indicatorBuffer = useMemo(() => {
    try {
      const sab = new SharedArrayBuffer(2 * Int32Array.BYTES_PER_ELEMENT)
      return new Int32Array(sab)
    } catch {
      return null
    }
  }, [])

  // inject buffer into worklet module state
  useEffect(() => {
    if (!indicatorBuffer) return
    engine.setIndicatorBuffer(
      moduleId,
      indicatorBuffer.buffer as SharedArrayBuffer,
    )
  }, [moduleId, indicatorBuffer])

  // animation loop: read indicator buffer and update DOM directly
  useEffect(() => {
    if (!indicatorBuffer) return
    let rafId: number
    const update = () => {
      const gate = Atomics.load(indicatorBuffer, 0)
      const div = Atomics.load(indicatorBuffer, 1)
      if (gateDotRef.current) {
        gateDotRef.current.style.background =
          gate > 0 ? 'var(--accent2)' : 'var(--shade2)'
      }
      if (divDotRef.current) {
        divDotRef.current.style.background =
          div > 0 ? 'var(--accent3)' : 'var(--shade2)'
      }
      rafId = requestAnimationFrame(update)
    }
    rafId = requestAnimationFrame(update)
    return () => cancelAnimationFrame(rafId)
  }, [indicatorBuffer])

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px 0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <div
          ref={gateDotRef}
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--shade2)',
            transition: 'background 30ms',
          }}
        />
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--shade2)' }}>
          clk
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <div
          ref={divDotRef}
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--shade2)',
            transition: 'background 30ms',
          }}
        />
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--shade2)' }}>
          div
        </span>
      </div>
    </div>
  )
}
