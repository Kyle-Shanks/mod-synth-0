import { useRef, useEffect, useMemo } from 'react'
import { useStore } from '../store'
import { internalWorkletId } from '../store/subpatchSlice'
import { rafScheduler } from '../utils/rafScheduler'
import styles from './SequencerIndicator.module.css'

interface SequencerIndicatorProps {
  moduleId: string
  stepCount: number
}

export function SequencerIndicator({
  moduleId,
  stepCount,
}: SequencerIndicatorProps) {
  const engineRevision = useStore((s) => s.engineRevision)
  const setIndicatorBuffer = useStore((s) => s.setIndicatorBuffer)
  const currentInstanceId = useStore(
    (s) => s.subpatchContext[s.subpatchContext.length - 1]?.instanceId,
  )
  const dotsRef = useRef<(HTMLDivElement | null)[]>([])
  const workletModuleId = currentInstanceId
    ? internalWorkletId(currentInstanceId, moduleId)
    : moduleId

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
    setIndicatorBuffer(
      workletModuleId,
      indicatorBuffer.buffer as SharedArrayBuffer,
    )
  }, [workletModuleId, indicatorBuffer, engineRevision, setIndicatorBuffer])

  // animation loop: read current step and update DOM directly
  useEffect(() => {
    if (!indicatorBuffer) return
    return rafScheduler.subscribe(() => {
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
    })
  }, [indicatorBuffer, stepCount])

  return (
    <div className={styles.root}>
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            dotsRef.current[i] = el
          }}
          className={styles.dot}
          data-enabled={i < stepCount ? 'true' : 'false'}
        />
      ))}
    </div>
  )
}
