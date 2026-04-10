import { useRef, useState, useCallback } from 'react'
import type { CSSProperties } from 'react'
import type { ParamDefinition } from '../engine/types'
import { useStore } from '../store'
import { classes } from '../utils/classes'
import styles from './Fader.module.css'

interface FaderProps {
  moduleId: string
  paramId: string
  definition: ParamDefinition
  value: number
  orientation?: 'vertical' | 'horizontal'
  length?: number // in px, default 64
}

const DRAG_SENSITIVITY = 0.004
const FINE_MULTIPLIER = 0.1
const HANDLE_SIZE = 10
const TRACK_WIDTH = 2

export function Fader({
  moduleId,
  paramId,
  definition,
  value,
  orientation = 'vertical',
  length = 64,
}: FaderProps) {
  const setParam = useStore((s) => s.setParam)
  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ currentValue: number } | null>(null)
  const elRef = useRef<HTMLDivElement>(null)

  const min = definition.min ?? 0
  const max = definition.max ?? 1
  const range = max - min

  const normalized = range > 0 ? (value - min) / range : 0

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.detail === 2) {
      // double-click: cancel any active drag, then reset to default
      dragRef.current = null
      setDragging(false)
      document.exitPointerLock()
      useStore.getState().stageHistory()
      setParam(moduleId, paramId, definition.default)
      useStore.getState().commitHistory()
      return
    }
    useStore.getState().stageHistory()
    dragRef.current = { currentValue: value }
    setDragging(true)
    elRef.current?.requestPointerLock()
  }, [value, moduleId, paramId, definition.default, setParam])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    const sensitivity = e.shiftKey ? DRAG_SENSITIVITY * FINE_MULTIPLIER : DRAG_SENSITIVITY

    // vertical: up = increase; horizontal: right = increase
    const delta = orientation === 'vertical' ? -e.movementY : e.movementX
    const newValue = Math.max(min, Math.min(max, dragRef.current.currentValue + delta * range * sensitivity))
    dragRef.current.currentValue = newValue
    setParam(moduleId, paramId, newValue)
  }, [moduleId, paramId, min, max, range, orientation, setParam])

  const handlePointerUp = useCallback(() => {
    dragRef.current = null
    setDragging(false)
    document.exitPointerLock()
    useStore.getState().commitHistory()
  }, [])

  const displayValue = definition.type === 'int'
    ? Math.round(value).toString()
    : value >= 1000
    ? `${(value / 1000).toFixed(1)}k`
    : value.toFixed(value < 10 ? 2 : 1)
  const showValue = hovered || dragging

  const isVertical = orientation === 'vertical'

  // track and handle positions
  const trackLength = length - HANDLE_SIZE
  const handleOffset = isVertical
    ? trackLength * (1 - normalized) // vertical: bottom=min, top=max
    : trackLength * normalized       // horizontal: left=min, right=max
  const controlStyle = {
    '--handle-size': `${HANDLE_SIZE}px`,
    '--track-width': `${TRACK_WIDTH}px`,
    '--fader-length': `${length}px`,
    '--track-length': `${trackLength}px`,
    '--handle-offset': `${handleOffset}px`,
  } as CSSProperties

  return (
    <div
      className={styles.root}
      data-param-control=''
      data-module-id={moduleId}
      data-param-id={paramId}
      data-orientation={orientation}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={(e) => {
        e.stopPropagation()
        dragRef.current = null
        setDragging(false)
        document.exitPointerLock()
        useStore.getState().stageHistory()
        setParam(moduleId, paramId, definition.default)
        useStore.getState().commitHistory()
      }}
    >
      <div
        ref={elRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={styles.control}
        data-orientation={orientation}
        style={controlStyle}
      >
        {/* track */}
        <div
          className={styles.track}
          data-orientation={orientation}
        />

        {/* handle */}
        <div
          className={classes(styles.handle, (dragging || hovered) && styles.handleActive)}
          data-orientation={orientation}
        />
      </div>

      {/* label / value display */}
      <div className={styles.labelArea}>
        <span className={classes(styles.labelText, showValue && styles.labelHidden)}>
          {definition.label}
        </span>
        <span
          className={classes(
            styles.labelText,
            showValue ? styles.labelVisible : styles.labelHidden,
          )}
        >
          {`${displayValue}${definition.unit ? ` ${definition.unit}` : ''}`}
        </span>
      </div>
    </div>
  )
}
