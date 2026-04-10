import { useRef, useEffect, useMemo } from 'react'
import { useStore } from '../store'
import styles from './ClockIndicator.module.css'

interface ClockIndicatorProps {
  moduleId: string
  label?: string
}

export function ClockIndicator({ moduleId, label = 'clk' }: ClockIndicatorProps) {
  const engineRevision = useStore((s) => s.engineRevision)
  const setIndicatorBuffer = useStore((s) => s.setIndicatorBuffer)
  const gateDotRef = useRef<HTMLDivElement>(null)

  // create SharedArrayBuffer for 2 Int32 values: [gateHigh, triggerHigh]
  // trigger value is currently unused in the UI indicator.
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
    setIndicatorBuffer(
      moduleId,
      indicatorBuffer.buffer as SharedArrayBuffer,
    )
  }, [moduleId, indicatorBuffer, engineRevision, setIndicatorBuffer])

  // animation loop: read indicator buffer and update DOM directly
  useEffect(() => {
    if (!indicatorBuffer) return
    let rafId: number
    const update = () => {
      const gate = Atomics.load(indicatorBuffer, 0)
      if (gateDotRef.current) {
        gateDotRef.current.style.background =
          gate > 0 ? 'var(--accent2)' : 'var(--shade2)'
      }
      rafId = requestAnimationFrame(update)
    }
    rafId = requestAnimationFrame(update)
    return () => cancelAnimationFrame(rafId)
  }, [indicatorBuffer])

  return (
    <div className={styles.root}>
      <div className={styles.group}>
        <div
          ref={gateDotRef}
          className={styles.dot}
        />
        <span className={styles.label}>
          {label}
        </span>
      </div>
    </div>
  )
}
