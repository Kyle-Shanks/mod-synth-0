import { useRef, useEffect, useMemo } from 'react'
import { engine } from '../engine/EngineController'

interface SequencerIndicatorProps {
  moduleId: string
  stepCount: number
}

export function SequencerIndicator({
  moduleId,
  stepCount,
}: SequencerIndicatorProps) {
  const dotsRef = useRef<(HTMLDivElement | null)[]>([])

  // create SharedArrayBuffer for 1 Int32 value: [currentStep]
  const indicatorBuffer = useMemo(() => {
    try {
      const sab = new SharedArrayBuffer(1 * Int32Array.BYTES_PER_ELEMENT)
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

  // animation loop: read current step and update DOM directly
  useEffect(() => {
    if (!indicatorBuffer) return
    let rafId: number
    const update = () => {
      const activeStep = Atomics.load(indicatorBuffer, 0)
      for (let i = 0; i < 8; i++) {
        const dot = dotsRef.current[i]
        if (dot) {
          const isActive = i === activeStep && i < stepCount
          dot.style.background = isActive
            ? 'var(--accent0)'
            : i < stepCount
              ? 'var(--shade2)'
              : 'var(--shade1)'
        }
      }
      rafId = requestAnimationFrame(update)
    }
    rafId = requestAnimationFrame(update)
    return () => cancelAnimationFrame(rafId)
  }, [indicatorBuffer, stepCount])

  return (
    <div
      style={{
        display: 'flex',
        gap: 3,
        justifyContent: 'center',
        padding: '2px 0',
      }}
    >
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            dotsRef.current[i] = el
          }}
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: i < stepCount ? 'var(--shade2)' : 'var(--shade1)',
            transition: 'background 30ms',
          }}
        />
      ))}
    </div>
  )
}
