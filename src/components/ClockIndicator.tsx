import { useRef, useEffect, useMemo } from 'react'
import { useStore } from '../store'
import { internalWorkletId } from '../store/subpatchSlice'
import { rafScheduler } from '../utils/rafScheduler'
import styles from './ClockIndicator.module.css'

interface ClockIndicatorProps {
  moduleId: string
  label?: string
}

export function ClockIndicator({ moduleId, label = 'clk' }: ClockIndicatorProps) {
  const engineRevision = useStore((s) => s.engineRevision)
  const setIndicatorBuffer = useStore((s) => s.setIndicatorBuffer)
  const currentInstanceId = useStore(
    (s) => s.subpatchContext[s.subpatchContext.length - 1]?.instanceId,
  )
  const gateDotRef = useRef<HTMLDivElement>(null)
  const workletModuleId = currentInstanceId
    ? internalWorkletId(currentInstanceId, moduleId)
    : moduleId

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
      workletModuleId,
      indicatorBuffer.buffer as SharedArrayBuffer,
    )
  }, [workletModuleId, indicatorBuffer, engineRevision, setIndicatorBuffer])

  // animation loop: read indicator buffer and update DOM directly
  useEffect(() => {
    if (!indicatorBuffer) return
    return rafScheduler.subscribe(() => {
      const gate = Atomics.load(indicatorBuffer, 0)
      if (gateDotRef.current) {
        gateDotRef.current.style.background =
          gate > 0 ? 'var(--accent2)' : 'var(--shade2)'
      }
    })
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
