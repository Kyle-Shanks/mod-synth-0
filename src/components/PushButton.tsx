import { useState, useCallback } from 'react'
import { useStore } from '../store'
import styles from './PushButton.module.css'

interface PushButtonProps {
  moduleId: string
}

export function PushButton({ moduleId }: PushButtonProps) {
  const [pressed, setPressed] = useState(false)
  const setGate = useStore((s) => s.setGate)

  const handleDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setPressed(true)
    setGate(moduleId, 'gate', 1)
  }, [moduleId, setGate])

  const handleUp = useCallback(() => {
    setPressed(false)
    setGate(moduleId, 'gate', 0)
  }, [moduleId, setGate])

  return (
    <div
      className={styles.button}
      data-pressed={pressed ? 'true' : 'false'}
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerLeave={() => {
        if (pressed) {
          setPressed(false)
          setGate(moduleId, 'gate', 0)
        }
      }}
    >
      {pressed && (
        <div className={styles.dot} />
      )}
    </div>
  )
}
