import { useState, useCallback, type PointerEvent } from 'react'
import { ModuleSquareButton } from '../../components/ModuleSquareButton'
import { useStore } from '../../store'
import { internalWorkletId } from '../../store/subpatchSlice'
import styles from './panel.module.css'

interface PushButtonPanelProps {
  moduleId: string
}

export function PushButtonPanel({ moduleId }: PushButtonPanelProps) {
  const [pressed, setPressed] = useState(false)
  const currentInstanceId = useStore(
    (s) => s.subpatchContext[s.subpatchContext.length - 1]?.instanceId,
  )
  const setGate = useStore((s) => s.setGate)
  const workletModuleId = currentInstanceId
    ? internalWorkletId(currentInstanceId, moduleId)
    : moduleId

  const handleDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setPressed(true)
      setGate(workletModuleId, 'gate', 1)
    },
    [workletModuleId, setGate],
  )

  const handleUp = useCallback(() => {
    setPressed(false)
    setGate(workletModuleId, 'gate', 0)
  }, [workletModuleId, setGate])

  return (
    <div className={styles.root}>
      <ModuleSquareButton
        pressed={pressed}
        ariaLabel='button gate'
        onPointerDown={handleDown}
        onPointerUp={handleUp}
        onPointerLeave={() => {
          if (pressed) {
            setPressed(false)
            setGate(workletModuleId, 'gate', 0)
          }
        }}
      />
    </div>
  )
}
