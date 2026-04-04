import { useRef, useState, useCallback } from 'react'
import type { ParamDefinition } from '../engine/types'
import { useStore } from '../store'

interface KnobProps {
  moduleId: string
  paramId: string
  definition: ParamDefinition
  value: number
}

const KNOB_SIZE = 32
const DRAG_SENSITIVITY = 0.005
const FINE_MULTIPLIER = 0.1

// For log-curve params, map normalized [0,1] <-> actual value via exponential scale
function logToValue(normalized: number, min: number, max: number): number {
  // log scale: min * (max/min)^normalized
  return min * Math.pow(max / min, normalized)
}
function valueToLog(value: number, min: number, max: number): number {
  return Math.log(value / min) / Math.log(max / min)
}

export function Knob({ moduleId, paramId, definition, value }: KnobProps) {
  const setParam = useStore((s) => s.setParam)
  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ currentValue: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const min = definition.min ?? 0
  const max = definition.max ?? 1
  const range = max - min
  const isLog = definition.curve === 'log' && min > 0

  // map value to angle: 270 degree range, -135 to +135
  const normalized = isLog ? valueToLog(value, min, max) : (value - min) / range
  const angle = -135 + normalized * 270

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
    // lock pointer so cursor stays hidden and in place
    svgRef.current?.requestPointerLock()
  }, [value, moduleId, paramId, definition.default, setParam])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    const sensitivity = e.shiftKey ? DRAG_SENSITIVITY * FINE_MULTIPLIER : DRAG_SENSITIVITY
    const dy = -e.movementY // up = positive

    let newValue: number
    if (isLog) {
      // work in normalized log space
      const currentNorm = valueToLog(dragRef.current.currentValue, min, max)
      const newNorm = Math.max(0, Math.min(1, currentNorm + dy * sensitivity))
      newValue = logToValue(newNorm, min, max)
    } else {
      newValue = Math.max(min, Math.min(max, dragRef.current.currentValue + dy * range * sensitivity))
    }
    dragRef.current.currentValue = newValue
    setParam(moduleId, paramId, newValue)
  }, [moduleId, paramId, min, max, range, isLog, setParam])

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

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    // cancel any active drag first, then reset — this fires reliably even inside pointer lock
    dragRef.current = null
    setDragging(false)
    document.exitPointerLock()
    useStore.getState().stageHistory()
    setParam(moduleId, paramId, definition.default)
    useStore.getState().commitHistory()
  }, [moduleId, paramId, definition.default, setParam])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        cursor: 'ns-resize',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={handleDoubleClick}
    >
      <svg
        ref={svgRef}
        width={KNOB_SIZE}
        height={KNOB_SIZE}
        viewBox="0 0 32 32"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* outer ring */}
        <circle cx="16" cy="16" r="13" fill="none" stroke="var(--shade2)" strokeWidth="1.5" />
        {/* position indicator */}
        <line
          x1="16"
          y1="16"
          x2={16 + 10 * Math.cos((angle - 90) * Math.PI / 180)}
          y2={16 + 10 * Math.sin((angle - 90) * Math.PI / 180)}
          stroke="var(--accent0)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* center dot */}
        <circle cx="16" cy="16" r="2" fill="var(--shade2)" />
      </svg>
      {/* fixed-height label area to prevent layout shift */}
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
