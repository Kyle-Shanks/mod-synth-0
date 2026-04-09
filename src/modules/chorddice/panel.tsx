import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../../store'

interface ChordDicePanelProps {
  moduleId: string
}

const CELL_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8]

const FACE_PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

export function ChordDicePanel({ moduleId }: ChordDicePanelProps) {
  const setGate = useStore((s) => s.setGate)
  const [rolling, setRolling] = useState(false)
  const [face, setFace] = useState(1)
  const rollIntervalRef = useRef<number | null>(null)
  const rollTimeoutRef = useRef<number | null>(null)

  const clearRollTimers = useCallback(() => {
    if (rollIntervalRef.current !== null) {
      window.clearInterval(rollIntervalRef.current)
      rollIntervalRef.current = null
    }
    if (rollTimeoutRef.current !== null) {
      window.clearTimeout(rollTimeoutRef.current)
      rollTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      clearRollTimers()
    }
  }, [clearRollTimers])

  const handlePress = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()

      setGate(moduleId, 'shuffle', 1)

      clearRollTimers()
      setRolling(true)
      setFace(1 + Math.floor(Math.random() * 6))

      rollIntervalRef.current = window.setInterval(() => {
        setFace(1 + Math.floor(Math.random() * 6))
      }, 48)

      rollTimeoutRef.current = window.setTimeout(() => {
        clearRollTimers()
        setRolling(false)
        setFace(1 + Math.floor(Math.random() * 6))
      }, 260)
    },
    [moduleId, setGate, clearRollTimers],
  )

  const activePips = FACE_PIPS[face] ?? FACE_PIPS[1] ?? [4]

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onPointerDown={handlePress}
        style={{
          width: 40,
          height: 40,
          border: `1.5px solid ${rolling ? 'var(--accent3)' : 'var(--shade2)'}`,
          borderRadius: 6,
          background: rolling ? 'var(--accent3)' : 'var(--shade3)',
          cursor: 'pointer',
          transition: 'background 80ms, border-color 80ms, transform 80ms',
          transform: rolling
            ? face % 2 === 0
              ? 'rotate(6deg) scale(0.95)'
              : 'rotate(-6deg) scale(0.95)'
            : 'none',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(3, 1fr)',
          padding: 6,
          boxSizing: 'border-box',
        }}
      >
        {CELL_INDICES.map((cellIdx) => {
          const isActive = activePips.includes(cellIdx)
          return (
            <div
              key={cellIdx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: isActive
                    ? rolling
                      ? 'var(--shade0)'
                      : 'var(--shade1)'
                    : 'transparent',
                  opacity: rolling && isActive ? 0.75 : 1,
                }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
