import { useRef, useState, useCallback } from 'react'
import type { ParamDefinition } from '../engine/types'
import { useStore } from '../store'

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

  const isVertical = orientation === 'vertical'

  // track and handle positions
  const trackLength = length - HANDLE_SIZE
  const handleOffset = isVertical
    ? trackLength * (1 - normalized) // vertical: bottom=min, top=max
    : trackLength * normalized       // horizontal: left=min, right=max

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        cursor: isVertical ? 'ns-resize' : 'ew-resize',
      }}
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
        style={{
          position: 'relative',
          width: isVertical ? HANDLE_SIZE + 8 : length,
          height: isVertical ? length : HANDLE_SIZE + 8,
        }}
      >
        {/* track */}
        <div style={{
          position: 'absolute',
          background: 'var(--shade2)',
          borderRadius: 1,
          ...(isVertical
            ? {
                left: '50%',
                transform: 'translateX(-50%)',
                width: TRACK_WIDTH,
                top: HANDLE_SIZE / 2,
                height: trackLength,
              }
            : {
                top: '50%',
                transform: 'translateY(-50%)',
                height: TRACK_WIDTH,
                left: HANDLE_SIZE / 2,
                width: trackLength,
              }),
        }} />

        {/* handle */}
        <div style={{
          position: 'absolute',
          background: dragging || hovered ? 'var(--accent0)' : 'var(--shade3)',
          borderRadius: 1,
          transition: 'background 100ms',
          ...(isVertical
            ? {
                left: '50%',
                transform: 'translateX(-50%)',
                top: handleOffset,
                width: HANDLE_SIZE + 6,
                height: HANDLE_SIZE,
              }
            : {
                top: '50%',
                transform: 'translateY(-50%)',
                left: handleOffset,
                height: HANDLE_SIZE + 6,
                width: HANDLE_SIZE,
              }),
        }} />
      </div>

      {/* label / value display */}
      <div style={{
        position: 'relative',
        height: 11,
        minWidth: 30,
        textAlign: 'center',
      }}>
        <span style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--shade3)',
          lineHeight: 1,
          whiteSpace: 'nowrap',
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          opacity: hovered || dragging ? 0 : 1,
          transition: 'opacity 80ms',
          pointerEvents: 'none',
        }}>
          {definition.label}
        </span>
        <span style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--shade3)',
          lineHeight: 1,
          whiteSpace: 'nowrap',
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          opacity: hovered || dragging ? 1 : 0,
          transition: 'opacity 80ms',
          pointerEvents: 'none',
        }}>
          {`${displayValue}${definition.unit ? ` ${definition.unit}` : ''}`}
        </span>
      </div>
    </div>
  )
}
