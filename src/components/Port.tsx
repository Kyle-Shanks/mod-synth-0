import { useRef, useEffect, useCallback } from 'react'
import type { PortType } from '../engine/types'
import { useStore } from '../store'
import { portPositionCache } from '../cables/PortPositionCache'
import { getModule } from '../modules/registry'
import { isSubpatchContainer, parseSubpatchPortId } from '../store/subpatchSlice'
import styles from './Port.module.css'

interface PortProps {
  moduleId: string
  portId: string
  direction: 'input' | 'output'
  type: PortType
  label: string
  connected: boolean
}

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
  const definitions = useStore((s) => s.definitions)
  const hoveredPortKey = useStore((s) => s.hoveredPortKey)
  const setHoveredPort = useStore((s) => s.setHoveredPort)

  const portKey = `${moduleId}:${portId}`
  const isHovered = hoveredPortKey === portKey

  const zoom = useStore((s) => s.zoom)

  function resolveEffectivePortType(
    targetModuleId: string,
    targetPortId: string,
  ): PortType | null {
    const mod = modules[targetModuleId]
    if (!mod) return null

    if (isSubpatchContainer(mod)) {
      const def = definitions[mod.subpatchDefinitionId]
      if (!def) return null
      const parsed = parseSubpatchPortId(targetPortId)
      if (!parsed.isSubpatchPort) return null
      const ports =
        parsed.direction === 'input' ? def.exposedInputs : def.exposedOutputs
      return ports[parsed.index]?.type ?? null
    }

    const dataType = mod.data?.portType
    if (
      dataType === 'audio' ||
      dataType === 'cv' ||
      dataType === 'gate' ||
      dataType === 'trigger'
    ) {
      return dataType
    }

    const def = getModule(mod.definitionId)
    if (!def) return null
    const portDef = def.outputs[targetPortId] ?? def.inputs[targetPortId]
    return portDef?.type ?? null
  }

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
        const srcType =
          resolveEffectivePortType(
            existingCable.from.moduleId,
            existingCable.from.portId,
          ) ?? type

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
  let connectedRingToken: PortType | null = null
  if (connected) {
    for (const cable of Object.values(cables)) {
      const isFrom =
        cable.from.moduleId === moduleId && cable.from.portId === portId
      const isTo = cable.to.moduleId === moduleId && cable.to.portId === portId
      if (!isFrom && !isTo) continue

      if (isFrom) {
        connectedRingToken = type
      } else {
        connectedRingToken =
          resolveEffectivePortType(cable.from.moduleId, cable.from.portId) ??
          type
      }
      break
    }
  }

  type RingToken = 'shade0' | 'shade2' | PortType
  let ringToken: RingToken
  if (dragState && isInvalidTarget) {
    ringToken = 'shade2'
  } else if (dragState && (validTarget || dragState.fromPortId === portId)) {
    ringToken = type
  } else if (isHovered) {
    ringToken = type
  } else if (connectedRingToken) {
    ringToken = connectedRingToken
  } else if (isOutput) {
    ringToken = 'shade0'
  } else {
    ringToken = 'shade2'
  }

  const isInvalidInputTarget = dragState && isInvalidTarget && !isOutput

  return (
    <div className={styles.wrapper} data-output={isOutput}>
      <div
        ref={ref}
        data-port-id={portId}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseEnter={() => setHoveredPort(portKey)}
        onMouseLeave={() => setHoveredPort(null)}
        className={styles.node}
        data-output={isOutput}
        data-invalid-target={isInvalidInputTarget}
        data-ring-token={ringToken}
        data-dot-token={isOutput ? 'shade0' : type}
      >
        {connected && (
          <div className={styles.connectedDot} />
        )}
      </div>
      <span className={styles.label}>{label}</span>
    </div>
  )
}
