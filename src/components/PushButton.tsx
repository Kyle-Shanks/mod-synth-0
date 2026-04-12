import { useState, useCallback, type PointerEvent } from 'react'
import { useStore } from '../store'
import { ModuleSquareButton } from './ModuleSquareButton'

interface PushButtonProps {
  moduleId: string
}

export function PushButton({ moduleId }: PushButtonProps) {
  const [pressed, setPressed] = useState(false)
  const setGate = useStore((s) => s.setGate)

  const handleDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
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
  )
}
