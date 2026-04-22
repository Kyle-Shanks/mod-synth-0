import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { internalWorkletId } from '../store/subpatchSlice'
import { rafScheduler } from '../utils/rafScheduler'
import styles from './MonoGainMeter.module.css'

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
      const ctx = state.subpatchContext
      const instanceId = ctx[ctx.length - 1]?.instanceId
      const workletId = instanceId ? internalWorkletId(instanceId, moduleId) : moduleId
      targetRef.current = state.meterValues[`${workletId}:${portId}`] ?? 0
    })
  }, [moduleId, portId])

  useEffect(() => {
    return rafScheduler.subscribe(() => {
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
    })
  }, [])

  return (
    <div className={styles.root}>
      <div className={styles.barFrame}>
        <div ref={fillRef} className={styles.fill} />
        <div className={styles.clipLine} />
      </div>
      <span className={styles.label}>
        {label}
      </span>
    </div>
  )
}
