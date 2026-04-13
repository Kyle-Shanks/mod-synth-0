import { useCallback, useEffect, useState, type PointerEvent } from 'react'
import { ModuleSquareButton } from '../../components/ModuleSquareButton'
import { useStore } from '../../store'
import { internalWorkletId } from '../../store/subpatchSlice'
import styles from './panel.module.css'

interface SampleHoldPanelProps {
  moduleId: string
}

export function SampleHoldPanel({ moduleId }: SampleHoldPanelProps) {
  const currentInstanceId = useStore(
    (s) => s.subpatchContext[s.subpatchContext.length - 1]?.instanceId,
  )
  const setGate = useStore((s) => s.setGate)
  const [holding, setHolding] = useState(false)
  const workletModuleId = currentInstanceId
    ? internalWorkletId(currentInstanceId, moduleId)
    : moduleId

  const releaseHold = useCallback(() => {
    if (!holding) return
    setHolding(false)
    setGate(workletModuleId, 'gate', 0)
  }, [holding, workletModuleId, setGate])

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      setHolding(true)
      setGate(workletModuleId, 'gate', 1)
    },
    [workletModuleId, setGate],
  )

  const handlePointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
      releaseHold()
    },
    [releaseHold],
  )

  useEffect(() => () => {
    if (holding) {
      setGate(workletModuleId, 'gate', 0)
    }
  }, [holding, workletModuleId, setGate])

  return (
    <div className={styles.root}>
      <ModuleSquareButton
        pressed={holding}
        ariaLabel='hold sample'
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={releaseHold}
        onPointerLeave={releaseHold}
      />
    </div>
  )
}
