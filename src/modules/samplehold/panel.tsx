import { useCallback, useEffect, useState, type PointerEvent } from 'react'
import { ModuleSquareButton } from '../../components/ModuleSquareButton'
import { useStore } from '../../store'
import styles from './panel.module.css'

interface SampleHoldPanelProps {
  moduleId: string
}

export function SampleHoldPanel({ moduleId }: SampleHoldPanelProps) {
  const setGate = useStore((s) => s.setGate)
  const [holding, setHolding] = useState(false)

  const releaseHold = useCallback(() => {
    if (!holding) return
    setHolding(false)
    setGate(moduleId, 'gate', 0)
  }, [holding, moduleId, setGate])

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      setHolding(true)
      setGate(moduleId, 'gate', 1)
    },
    [moduleId, setGate],
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
      setGate(moduleId, 'gate', 0)
    }
  }, [holding, moduleId, setGate])

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
