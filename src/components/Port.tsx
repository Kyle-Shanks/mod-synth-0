import { useRef, useEffect, useCallback } from 'react'
import type { PortType } from '../engine/types'
import { useStore } from '../store'
import { portPositionCache } from '../cables/PortPositionCache'
import { getModule } from '../modules/registry'

interface PortProps {
  moduleId: string
  portId: string
  direction: 'input' | 'output'
  type: PortType
  label: string
  connected: boolean
}

const PORT_RADIUS = 8

export function Port({ moduleId, portId, direction, type, label, connected }: PortProps) {
  const ref = useRef<HTMLDivElement>(null)
  const dragState = useStore((s) => s.dragState)
  const setDragState = useStore((s) => s.setDragState)
  const addCable = useStore((s) => s.addCable)
  const removeCable = useStore((s) => s.removeCable)
  const cables = useStore((s) => s.cables)
  const hoveredPortKey = useStore((s) => s.hoveredPortKey)
  const setHoveredPort = useStore((s) => s.setHoveredPort)

  const portKey = `${moduleId}:${portId}`
  const isHovered = hoveredPortKey === portKey

  // update port position cache
  const updatePosition = useCallback(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const rackEl = el.closest('[data-rack]')
    if (!rackEl) return
    const rackRect = rackEl.getBoundingClientRect()
    portPositionCache.set(moduleId, portId, {
      x: rect.left - rackRect.left + rect.width / 2,
      y: rect.top - rackRect.top + rect.height / 2,
    })
  }, [moduleId, portId])

  useEffect(() => {
    updatePosition()
  }, [updatePosition])

  // expose updatePosition for parent to call on drag
  useEffect(() => {
    const el = ref.current
    if (!el) return
    ;(el as HTMLDivElement & { _updatePortPosition?: () => void })._updatePortPosition = updatePosition
  }, [updatePosition])

  const isValidTarget = useCallback(() => {
    if (!dragState) return false
    // can't connect to self
    if (dragState.fromModuleId === moduleId && dragState.fromPortId === portId) return false
    // must be opposite direction
    if (dragState.fromDirection === direction) return false
    // check type compatibility: audio↔cv allowed, trigger↔gate allowed
    const a = dragState.portType
    const b = type
    if (a === b) return true
    if ((a === 'audio' && b === 'cv') || (a === 'cv' && b === 'audio')) return true
    if ((a === 'trigger' && b === 'gate') || (a === 'gate' && b === 'trigger')) return true
    return false
  }, [dragState, moduleId, portId, direction, type])

  function handleMouseDown(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()

    // if there's an active drag and this port is a valid target, complete the connection
    if (dragState && isValidTarget()) {
      completeCableConnection()
      return
    }

    // use port's cached position as initial cursor so cable doesn't snap to (0,0)
    const portPos = portPositionCache.get(moduleId, portId)
    const initX = portPos?.x ?? 0
    const initY = portPos?.y ?? 0

    if (direction === 'output') {
      // start dragging from this output
      setDragState({
        fromModuleId: moduleId,
        fromPortId: portId,
        fromDirection: 'output',
        portType: type,
        cursorX: initX,
        cursorY: initY,
      })
    } else {
      // input port: if connected, pick up the cable from the other end
      const existingCable = Object.values(cables).find(
        (c) => c.to.moduleId === moduleId && c.to.portId === portId
      )
      if (existingCable) {
        // find the type of the source port
        const srcMod = useStore.getState().modules[existingCable.from.moduleId]
        const srcDef = srcMod ? getModule(srcMod.definitionId) : undefined
        const srcPort = srcDef?.outputs[existingCable.from.portId]
        const srcType = srcPort?.type ?? type

        const srcPos = portPositionCache.get(existingCable.from.moduleId, existingCable.from.portId)
        removeCable(existingCable.id)
        setDragState({
          fromModuleId: existingCable.from.moduleId,
          fromPortId: existingCable.from.portId,
          fromDirection: 'output',
          portType: srcType,
          cursorX: srcPos?.x ?? initX,
          cursorY: srcPos?.y ?? initY,
        })
      } else {
        // start dragging from this input
        setDragState({
          fromModuleId: moduleId,
          fromPortId: portId,
          fromDirection: 'input',
          portType: type,
          cursorX: initX,
          cursorY: initY,
        })
      }
    }
  }

  function completeCableConnection() {
    if (!dragState) return
    const from = dragState.fromDirection === 'output'
      ? { moduleId: dragState.fromModuleId, portId: dragState.fromPortId }
      : { moduleId, portId }
    const to = dragState.fromDirection === 'output'
      ? { moduleId, portId }
      : { moduleId: dragState.fromModuleId, portId: dragState.fromPortId }

    addCable({
      id: `cable-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      from,
      to,
    })
    setDragState(null)
  }

  function handleMouseUp(e: React.MouseEvent) {
    e.stopPropagation()
    if (!dragState || !isValidTarget()) return
    completeCableConnection()
  }

  const isOutput = direction === 'output'
  const validTarget = isValidTarget()

  // determine if this port is an invalid drag target
  const isInvalidTarget = !!dragState
    && dragState.fromModuleId !== moduleId
    && dragState.fromDirection !== direction
    && !validTarget

  let ringColor = 'var(--shade2)'
  if (isHovered || validTarget) ringColor = 'var(--accent0)'
  if (dragState && isInvalidTarget && isHovered) ringColor = 'var(--accent2)'
  if (isOutput) {
    ringColor = isHovered
      ? (dragState && isInvalidTarget ? 'var(--accent2)' : 'var(--accent0)')
      : 'var(--shade0)'
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
    >
      <div
        ref={ref}
        data-port-id={portId}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseEnter={() => setHoveredPort(portKey)}
        onMouseLeave={() => setHoveredPort(null)}
        style={{
          width: PORT_RADIUS * 2 + 4,
          height: PORT_RADIUS * 2 + 4,
          borderRadius: '50%',
          border: `1.5px solid ${ringColor}`,
          background: isOutput ? 'var(--shade3)' : 'var(--shade1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'crosshair',
          transition: 'border-color 100ms',
        }}
      >
        {connected && (
          <div style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: isOutput ? 'var(--shade0)' : `var(--cable-${type})`,
          }} />
        )}
      </div>
      <span style={{
        fontSize: 'var(--text-xs)',
        color: isOutput ? 'var(--shade0)' : 'var(--shade3)',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
    </div>
  )
}
