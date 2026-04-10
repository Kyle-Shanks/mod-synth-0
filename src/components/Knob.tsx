import { useRef, useState, useCallback, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { ParamDefinition } from '../engine/types'
import { useStore } from '../store'
import styles from './Knob.module.css'
import contextMenuStyles from '../styles/contextMenuBase.module.css'

interface KnobProps {
  moduleId: string
  paramId: string
  definition: ParamDefinition
  value: number
  // optional override: if provided, called instead of setParam
  onChangeOverride?: (value: number) => void
}

function classes(...tokens: Array<string | false | null | undefined>): string {
  return tokens.filter(Boolean).join(' ')
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

export function Knob({ moduleId, paramId, definition, value, onChangeOverride }: KnobProps) {
  const setParam = useStore((s) => s.setParam)
  const applyValue = useCallback((v: number) => {
    if (onChangeOverride) { onChangeOverride(v) } else { setParam(moduleId, paramId, v) }
  }, [onChangeOverride, setParam, moduleId, paramId])
  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ currentValue: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [macroMenu, setMacroMenu] = useState<{ x: number; y: number } | null>(null)

  // close macro menu on outside click
  useEffect(() => {
    if (!macroMenu) return
    const handler = () => setMacroMenu(null)
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [macroMenu])

  // reactive: re-renders when the macro is added or removed
  const isMacroExposed = useStore((s) => {
    if (onChangeOverride) return false  // macro knob on container face — never lock itself
    const ctx = s.subpatchContext
    const defId = ctx[ctx.length - 1]?.definitionId
    if (!defId) return false
    const macroId = `macro-${moduleId}-${paramId}`
    return !!s.definitions[defId]?.macros.find((m) => m.id === macroId)
  })

  const min = definition.min ?? 0
  const max = definition.max ?? 1
  const range = max - min
  const isLog = definition.curve === 'log' && min > 0

  // map value to angle: 270 degree range, -135 to +135
  const normalized = isLog ? valueToLog(value, min, max) : (value - min) / range
  const angle = -135 + normalized * 270

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (isMacroExposed) return  // locked — controlled by the macro knob on the container
    e.preventDefault()
    e.stopPropagation()
    if (e.detail === 2) {
      // double-click: cancel any active drag, then reset to default
      dragRef.current = null
      setDragging(false)
      document.exitPointerLock()
      useStore.getState().stageHistory()
      applyValue(definition.default)
      useStore.getState().commitHistory()
      return
    }
    useStore.getState().stageHistory()
    dragRef.current = { currentValue: value }
    setDragging(true)
    // lock pointer so cursor stays hidden and in place
    svgRef.current?.requestPointerLock()
  }, [value, definition.default, applyValue, isMacroExposed])

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
    applyValue(newValue)
  }, [min, max, range, isLog, applyValue])

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

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (isMacroExposed) return
    e.stopPropagation()
    // cancel any active drag first, then reset — this fires reliably even inside pointer lock
    dragRef.current = null
    setDragging(false)
    document.exitPointerLock()
    useStore.getState().stageHistory()
    applyValue(definition.default)
    useStore.getState().commitHistory()
  }, [definition.default, applyValue, isMacroExposed])

  // right-click inside a subpatch (on a non-macro knob) → "expose as macro"
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (onChangeOverride) return // macro knob itself — skip
    const ctx = useStore.getState().subpatchContext
    if (ctx.length === 0) return // not inside a subpatch
    e.preventDefault()
    e.stopPropagation()
    setMacroMenu({ x: e.clientX, y: e.clientY })
  }, [onChangeOverride])

  function toggleMacro() {
    const ctx = useStore.getState().subpatchContext
    const defId = ctx[ctx.length - 1]?.definitionId
    if (!defId) return
    const macroId = `macro-${moduleId}-${paramId}`
    const def = useStore.getState().definitions[defId]
    const existing = def?.macros.find((m) => m.id === macroId)
    if (existing) {
      useStore.getState().removeMacro(defId, macroId)
    } else {
      useStore.getState().addMacro(defId, {
        id: macroId,
        label: definition.label,
        targetModuleId: moduleId,
        targetParamId: paramId,
      })
    }
    setMacroMenu(null)
  }

  return (
    <div
      className={classes(styles.root, isMacroExposed && styles.rootLocked)}
      data-param-control=''
      data-module-id={moduleId}
      data-param-id={paramId}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      {macroMenu && createPortal(
        <>
          <div
            className={classes(contextMenuStyles.backdrop, styles.menuBackdrop)}
            onMouseDown={() => setMacroMenu(null)}
          />
          <div
            className={classes(contextMenuStyles.menu, styles.menu)}
            style={{
              left: macroMenu.x,
              top: macroMenu.y,
            } as CSSProperties}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className={classes(contextMenuStyles.menuTitle, styles.menuTitle)}>
              {definition.label}
            </div>
            <div
              onClick={toggleMacro}
              className={classes(contextMenuStyles.menuItem, styles.menuAction)}
              data-exposed={isMacroExposed ? 'true' : 'false'}
            >
              {isMacroExposed ? 'remove macro' : 'expose as macro'}
            </div>
          </div>
        </>,
        document.body,
      )}

      <svg
        ref={svgRef}
        width={KNOB_SIZE}
        height={KNOB_SIZE}
        viewBox="0 0 32 32"
        className={classes(styles.knobSvg, isMacroExposed && styles.knobSvgLocked)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* outer ring */}
        <circle
          cx="16" cy="16" r="13" fill="none"
          stroke={isMacroExposed ? 'var(--accent1)' : 'var(--shade2)'}
          strokeWidth="1.5"
          strokeDasharray={isMacroExposed ? '3 2' : undefined}
        />
        {/* position indicator */}
        <line
          x1="16"
          y1="16"
          x2={16 + 10 * Math.cos((angle - 90) * Math.PI / 180)}
          y2={16 + 10 * Math.sin((angle - 90) * Math.PI / 180)}
          stroke={isMacroExposed ? 'var(--accent1)' : 'var(--accent0)'}
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* center dot */}
        <circle cx="16" cy="16" r="2" fill={isMacroExposed ? 'var(--accent1)' : 'var(--shade2)'} />
      </svg>
      {/* fixed-height label area to prevent layout shift */}
      <div
        className={classes(styles.labelArea, isMacroExposed && styles.labelAreaLocked)}
      >
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
