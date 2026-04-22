import { useRef, useLayoutEffect, useCallback, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store'
import { portPositionCache } from './PortPositionCache'
import { cableDragCursor } from './CableDragCursor'
import { cablePath } from './CableBezier'
import type { PortType } from '../engine/types'
import { getModule } from '../modules/registry'
import { isSubpatchContainer, parseSubpatchPortId } from '../store/subpatchSlice'
import { classes } from '../utils/classes'
import styles from './CableLayer.module.css'
import contextMenuStyles from '../styles/contextMenuBase.module.css'

// Wider invisible stroke used purely for hit detection — makes cables much easier to hover
const HIT_STROKE_WIDTH = 14

const CABLE_COLORS: Record<PortType, string> = {
  audio: 'var(--cable-audio)',
  cv: 'var(--cable-cv)',
  gate: 'var(--cable-gate)',
  trigger: 'var(--cable-trigger)',
}

export function CableLayer() {
  const svgRef = useRef<SVGSVGElement>(null)
  const hitPathRefs = useRef<Record<string, SVGPathElement | null>>({})
  const visualPathRefs = useRef<Record<string, SVGPathElement | null>>({})
  const previewPathRef = useRef<SVGPathElement | null>(null)
  const cables = useStore((s) => s.cables)
  const definitions = useStore((s) => s.definitions)
  const subpatchContext = useStore((s) => s.subpatchContext)
  const tautness = useStore((s) => s.cableTautness)
  const dragState = useStore((s) => s.dragState)
  const hoveredCableId = useStore((s) => s.hoveredCableId)
  const setHoveredCable = useStore((s) => s.setHoveredCable)
  const removeCable = useStore((s) => s.removeCable)
  const feedbackCableIds = useStore((s) => s.feedbackCableIds)
  // ports take precedence — suppress cable pointer events while a port is hovered
  const hoveredPortKey = useStore((s) => s.hoveredPortKey)

  // Filter cables to only those belonging to the current view.
  // While drilled into a subpatch, root cables must be hidden and vice-versa.
  const visibleCables = useMemo(() => {
    if (subpatchContext.length === 0) {
      // Root view: exclude any cable that belongs to a definition's internal cables
      const internalCableIds = new Set<string>()
      for (const def of Object.values(definitions)) {
        for (const id of Object.keys(def.cables)) internalCableIds.add(id)
      }
      return Object.values(cables).filter((c) => !internalCableIds.has(c.id))
    } else {
      // Drill-down view: only show cables from the current definition
      const currentDefId = subpatchContext[subpatchContext.length - 1]?.definitionId
      const def = currentDefId ? definitions[currentDefId] : undefined
      if (!def) return []
      const defCableIds = new Set(Object.keys(def.cables))
      return Object.values(cables).filter((c) => defCableIds.has(c.id))
    }
  }, [cables, subpatchContext, definitions])

  const [contextMenu, setContextMenu] = useState<{
    cableId: string
    x: number
    y: number
  } | null>(null)

  const updatePaths = useCallback(() => {
    const svg = svgRef.current
    if (!svg) return

    // update all cable paths (both hit area and visual path share the same bezier)
    for (const cable of visibleCables) {
      const fromPos = portPositionCache.get(
        cable.from.moduleId,
        cable.from.portId,
      )
      const toPos = portPositionCache.get(cable.to.moduleId, cable.to.portId)
      if (!fromPos || !toPos) continue

      const d = cablePath(
        {
          x1: fromPos.x,
          y1: fromPos.y,
          x2: toPos.x,
          y2: toPos.y,
        },
        tautness,
      )

      const hitPath = hitPathRefs.current[cable.id]
      hitPath?.setAttribute('d', d)
      const visualPath = visualPathRefs.current[cable.id]
      visualPath?.setAttribute('d', d)
    }

    // update drag preview cable
    const preview = previewPathRef.current
    if (preview && dragState) {
      const fromPos = portPositionCache.get(
        dragState.fromModuleId,
        dragState.fromPortId,
      )
      const cursor = cableDragCursor.get()
      if (fromPos) {
        preview.setAttribute(
          'd',
          cablePath(
            {
              x1: fromPos.x,
              y1: fromPos.y,
              x2: cursor.x,
              y2: cursor.y,
            },
            tautness,
          ),
        )
        preview.style.display = 'block'
      }
    } else if (preview) {
      preview.style.display = 'none'
    }
  }, [visibleCables, tautness, dragState])

  // subscribe to port position changes for live cable updates during drag
  useLayoutEffect(() => {
    updatePaths()
    const unsubPortCache = portPositionCache.subscribe(updatePaths)
    const unsubDragCursor = cableDragCursor.subscribe(updatePaths)
    return () => {
      unsubPortCache()
      unsubDragCursor()
    }
  }, [updatePaths])

  // resolve cable color from the "from" port type
  function getCableColor(fromModuleId: string, fromPortId: string): string {
    const mod = useStore.getState().modules[fromModuleId]
    if (!mod) return 'var(--shade2)'

    // subpatch container: resolve port type from definition's exposedOutputs/exposedInputs
    if (isSubpatchContainer(mod)) {
      const def = definitions[mod.subpatchDefinitionId]
      if (!def) return 'var(--shade2)'
      const parsed = parseSubpatchPortId(fromPortId)
      if (!parsed.isSubpatchPort) return 'var(--shade2)'
      const ports = parsed.direction === 'output' ? def.exposedOutputs : def.exposedInputs
      const exposed = ports[parsed.index]
      return exposed ? CABLE_COLORS[exposed.type] : 'var(--shade2)'
    }

    // proxy modules (subpatch-input/output) and other special modules may override
    // visual port typing via instance data.
    const dataType = mod.data?.portType
    if (
      dataType === 'audio' ||
      dataType === 'cv' ||
      dataType === 'gate' ||
      dataType === 'trigger'
    ) {
      return CABLE_COLORS[dataType]
    }

    const def = getModule(mod.definitionId)
    if (!def) return 'var(--shade2)'
    const port = def.outputs[fromPortId] ?? def.inputs[fromPortId]
    return port ? CABLE_COLORS[port.type] : 'var(--shade2)'
  }

  const handleCableContextMenu = useCallback(
    (e: React.MouseEvent, cableId: string) => {
      e.preventDefault()
      e.stopPropagation()
      setContextMenu({ cableId, x: e.clientX, y: e.clientY })
    },
    [],
  )

  const handleDisconnect = useCallback(() => {
    if (contextMenu) {
      removeCable(contextMenu.cableId)
      setContextMenu(null)
    }
  }, [contextMenu, removeCable])

  return (
    <>
      <svg
        ref={svgRef}
        className={styles.svg}
      >
        {visibleCables.map((cable) => {
          const isHovered = hoveredCableId === cable.id
          const isFeedback = feedbackCableIds.has(cable.id)
          const hasHover = hoveredCableId !== null
          // suppress cable hit detection while the user hovers a port — port wins
          const cablePointerEvents = hoveredPortKey ? 'none' : 'stroke'
          return (
            <g key={cable.id}>
              {/* wide transparent hit area — easier to grab than the thin visible stroke */}
              <path
                data-cable-id={cable.id}
                ref={(el) => {
                  hitPathRefs.current[cable.id] = el
                }}
                fill='none'
                stroke='transparent'
                strokeWidth={HIT_STROKE_WIDTH}
                strokeLinecap='round'
                className={styles.hitPath}
                pointerEvents={cablePointerEvents}
                onMouseEnter={() => setHoveredCable(cable.id)}
                onMouseLeave={() => setHoveredCable(null)}
                onContextMenu={(e) => handleCableContextMenu(e, cable.id)}
              />
              {/* visible cable */}
              <path
                data-cable-visual={cable.id}
                ref={(el) => {
                  visualPathRefs.current[cable.id] = el
                }}
                fill='none'
                stroke={getCableColor(cable.from.moduleId, cable.from.portId)}
                strokeWidth={isHovered ? 3 : 1.5}
                strokeLinecap='round'
                strokeDasharray={isFeedback ? '8 4' : undefined}
                opacity={hasHover && !isHovered ? 0.25 : 0.9}
                className={styles.visualPath}
              />
            </g>
          )
        })}
        {/* drag preview cable */}
        <path
          data-cable-preview=''
          ref={previewPathRef}
          fill='none'
          stroke={
            dragState ? CABLE_COLORS[dragState.portType] : 'var(--shade2)'
          }
          strokeWidth={2}
          strokeLinecap='round'
          strokeDasharray='6 4'
          opacity={0.6}
          className={styles.previewPath}
        />
      </svg>

      {/* cable context menu — portalled to document.body to escape the rack's CSS transform */}
      {contextMenu &&
        createPortal(
          <div
            className={classes(contextMenuStyles.backdrop, styles.menuOverlay)}
            onMouseDown={() => setContextMenu(null)}
          >
            <div
              className={classes(contextMenuStyles.menu, styles.menu)}
              style={{
                left: contextMenu.x,
                top: contextMenu.y,
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div
                onClick={handleDisconnect}
                className={classes(contextMenuStyles.menuItem, styles.menuItem)}
              >
                disconnect
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
