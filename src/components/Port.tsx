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

export function Port({
  moduleId,
  portId,
  direction,
  type,
  label,
  connected,
}: PortProps) {
  const ref = useRef<HTMLDivElement>(null)
  const dragState = useStore((s) => s.dragState)
  const setDragState = useStore((s) => s.setDragState)
  const addCable = useStore((s) => s.addCable)
  const removeCable = useStore((s) => s.removeCable)
  const cables = useStore((s) => s.cables)
  const modules = useStore((s) => s.modules)
  const hoveredPortKey = useStore((s) => s.hoveredPortKey)
  const setHoveredPort = useStore((s) => s.setHoveredPort)

  const portKey = `${moduleId}:${portId}`
  const isHovered = hoveredPortKey === portKey

  const zoom = useStore((s) => s.zoom)

  // update port position cache
  // getBoundingClientRect() returns viewport (scaled) coords; divide by zoom to get
  // logical coords matching the SVG/Tooltip coordinate space inside the CSS-scaled rack
  const updatePosition = useCallback(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const rackEl = el.closest('[data-rack]')
    if (!rackEl) return
    const rackRect = rackEl.getBoundingClientRect()
    portPositionCache.set(moduleId, portId, {
      x: (rect.left - rackRect.left + rect.width / 2) / zoom,
      y: (rect.top - rackRect.top + rect.height / 2) / zoom,
    })
  }, [moduleId, portId, zoom])

  useEffect(() => {
    updatePosition()
  }, [updatePosition])

  // expose updatePosition for parent to call on drag
  useEffect(() => {
    const el = ref.current
    if (!el) return
    ;(
      el as HTMLDivElement & { _updatePortPosition?: () => void }
    )._updatePortPosition = updatePosition
  }, [updatePosition])

  const isValidTarget = useCallback(() => {
    if (!dragState) return false
    // can't connect to self
    if (dragState.fromModuleId === moduleId && dragState.fromPortId === portId)
      return false
    // must be opposite direction
    if (dragState.fromDirection === direction) return false
    // check type compatibility: audio↔cv allowed, trigger↔gate allowed
    const a = dragState.portType
    const b = type
    if (a === b) return true
    if ((a === 'audio' && b === 'cv') || (a === 'cv' && b === 'audio'))
      return true
    if ((a === 'trigger' && b === 'gate') || (a === 'gate' && b === 'trigger'))
      return true
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
        (c) => c.to.moduleId === moduleId && c.to.portId === portId,
      )
      if (existingCable) {
        // find the type of the source port
        const srcMod = useStore.getState().modules[existingCable.from.moduleId]
        const srcDef = srcMod ? getModule(srcMod.definitionId) : undefined
        const srcPort = srcDef?.outputs[existingCable.from.portId]
        const srcType = srcPort?.type ?? type

        const srcPos = portPositionCache.get(
          existingCable.from.moduleId,
          existingCable.from.portId,
        )
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
    const from =
      dragState.fromDirection === 'output'
        ? { moduleId: dragState.fromModuleId, portId: dragState.fromPortId }
        : { moduleId, portId }
    const to =
      dragState.fromDirection === 'output'
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

  // a port is an invalid drag target if: there's a drag, it's the opposite direction,
  // it's not self, and the signal types are incompatible
  const isInvalidTarget =
    !!dragState &&
    dragState.fromModuleId !== moduleId &&
    dragState.fromDirection !== direction &&
    !validTarget

  // For connected ports, match ring color to the actual connected cable source type.
  let connectedRingColor: string | null = null
  if (connected) {
    for (const cable of Object.values(cables)) {
      const isFrom =
        cable.from.moduleId === moduleId && cable.from.portId === portId
      const isTo = cable.to.moduleId === moduleId && cable.to.portId === portId
      if (!isFrom && !isTo) continue

      if (isFrom) {
        connectedRingColor = `var(--cable-${type})`
      } else {
        const srcMod = modules[cable.from.moduleId]
        const srcDef = srcMod ? getModule(srcMod.definitionId) : undefined
        const srcPort =
          srcDef?.outputs[cable.from.portId] ??
          srcDef?.inputs[cable.from.portId]
        connectedRingColor = `var(--cable-${srcPort?.type ?? type})`
      }
      break
    }
  }

  const typeRingColor = `var(--cable-${type})`

  let ringColor: string
  if (dragState && isInvalidTarget) {
    ringColor = 'var(--shade2)'
  } else if (dragState && (validTarget || dragState.fromPortId === portId)) {
    ringColor = typeRingColor
  } else if (isHovered) {
    ringColor = typeRingColor
  } else if (connectedRingColor) {
    ringColor = connectedRingColor
  } else if (isOutput) {
    ringColor = 'var(--shade0)'
  } else {
    ringColor = 'var(--shade2)'
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        position: 'relative',
        zIndex: 4,
      }}
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
          opacity: dragState && isInvalidTarget && !isOutput ? 0.5 : 1,
          border: `1.5px solid ${ringColor}`,
          background: isOutput ? 'var(--shade3)' : 'var(--shade1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'crosshair',
          transition: 'border-color 100ms',
          position: 'relative',
          zIndex: 5,
        }}
      >
        {connected && (
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: isOutput ? 'var(--shade0)' : `var(--cable-${type})`,
            }}
          />
        )}
      </div>
      <span
        style={{
          fontSize: 'var(--text-xs)',
          color: isOutput ? 'var(--shade0)' : 'var(--shade3)',
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </div>
  )
}
