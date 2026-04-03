import { useState, useCallback } from 'react'
import { engine } from '../engine/EngineController'

interface PushButtonProps {
  moduleId: string
}

export function PushButton({ moduleId }: PushButtonProps) {
  const [pressed, setPressed] = useState(false)

  const handleDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setPressed(true)
    engine.setGate(moduleId, 'gate', 1)
  }, [moduleId])

  const handleUp = useCallback(() => {
    setPressed(false)
    engine.setGate(moduleId, 'gate', 0)
  }, [moduleId])

  return (
    <div
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerLeave={() => {
        if (pressed) {
          setPressed(false)
          engine.setGate(moduleId, 'gate', 0)
        }
      }}
      style={{
        width: 40,
        height: 40,
        border: '1.5px solid var(--shade2)',
        borderRadius: 4,
        background: pressed ? 'var(--accent0)' : 'var(--shade1)',
        cursor: 'pointer',
        transition: 'background 50ms',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {pressed && (
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: 'var(--shade0)',
          opacity: 0.6,
        }} />
      )}
    </div>
  )
}
