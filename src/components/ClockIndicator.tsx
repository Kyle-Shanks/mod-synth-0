import { useRef, useEffect, useMemo } from 'react'
import { useStore } from '../store'
import styles from './ClockIndicator.module.css'

interface ClockIndicatorProps {
  moduleId: string
}

export function ClockIndicator({ moduleId }: ClockIndicatorProps) {
  const engineRevision = useStore((s) => s.engineRevision)
  const setIndicatorBuffer = useStore((s) => s.setIndicatorBuffer)
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
    <div className={styles.root}>
      <div className={styles.group}>
        <div
          ref={gateDotRef}
          className={styles.dot}
        />
        <span className={styles.label}>
          clk
        </span>
      </div>
      <div className={styles.group}>
        <div
          ref={divDotRef}
          className={styles.dot}
        />
        <span className={styles.label}>
          div
        </span>
      </div>
    </div>
  )
}
