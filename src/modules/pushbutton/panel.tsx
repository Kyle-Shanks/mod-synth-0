import { useState, useCallback, type PointerEvent } from 'react'
import { ModuleSquareButton } from '../../components/ModuleSquareButton'
import { useStore } from '../../store'
import styles from './panel.module.css'

interface PushButtonPanelProps {
  moduleId: string
}

export function PushButtonPanel({ moduleId }: PushButtonPanelProps) {
  const [pressed, setPressed] = useState(false)
  const setGate = useStore((s) => s.setGate)

  const handleDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setPressed(true)
      setGate(moduleId, 'gate', 1)
    },
    [moduleId, setGate],
  )

  const handleUp = useCallback(() => {
    setPressed(false)
    setGate(moduleId, 'gate', 0)
  }, [moduleId, setGate])

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
            setGate(moduleId, 'gate', 0)
          }
        }}
      />
    </div>
  )
}
