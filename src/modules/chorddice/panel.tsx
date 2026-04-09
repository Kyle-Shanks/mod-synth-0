import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../../store'
import styles from './panel.module.css'

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
    <div className={styles.root}>
      <div
        onPointerDown={handlePress}
        className={styles.die}
        data-rolling={rolling ? 'true' : 'false'}
        data-parity={face % 2 === 0 ? 'even' : 'odd'}
      >
        {CELL_INDICES.map((cellIdx) => {
          const isActive = activePips.includes(cellIdx)
          return (
            <div
              key={cellIdx}
              className={styles.cell}
            >
              <div
                className={styles.pip}
                data-active={isActive ? 'true' : 'false'}
                data-rolling={rolling ? 'true' : 'false'}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
