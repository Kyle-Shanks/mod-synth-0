import { useRef, useLayoutEffect, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store'
import { portPositionCache } from './PortPositionCache'
import { cablePath } from './CableBezier'
import type { PortType } from '../engine/types'
import { getModule } from '../modules/registry'

// Wider invisible stroke used purely for hit detection — makes cables much easier to hover
const HIT_STROKE_WIDTH = 14

const CABLE_COLORS: Record<PortType, string> = {
  audio:   'var(--cable-audio)',
  cv:      'var(--cable-cv)',
  gate:    'var(--cable-gate)',
  trigger: 'var(--cable-trigger)',
}

export function CableLayer() {
  const svgRef = useRef<SVGSVGElement>(null)
  const cables = useStore((s) => s.cables)
  const modules = useStore((s) => s.modules)
  const tautness = useStore((s) => s.cableTautness)
  const dragState = useStore((s) => s.dragState)
  const hoveredCableId = useStore((s) => s.hoveredCableId)
  const setHoveredCable = useStore((s) => s.setHoveredCable)
  const removeCable = useStore((s) => s.removeCable)
  const feedbackCableIds = useStore((s) => s.feedbackCableIds)
  // ports take precedence — suppress cable pointer events while a port is hovered
  const hoveredPortKey = useStore((s) => s.hoveredPortKey)

  const [contextMenu, setContextMenu] = useState<{
    cableId: string
    x: number
    y: number
  } | null>(null)

  const updatePaths = useCallback(() => {
    const svg = svgRef.current
    if (!svg) return

    // update all cable paths (both hit area and visual path share the same bezier)
    for (const cable of Object.values(cables)) {
      const fromPos = portPositionCache.get(cable.from.moduleId, cable.from.portId)
      const toPos = portPositionCache.get(cable.to.moduleId, cable.to.portId)
      if (!fromPos || !toPos) continue

      const d = cablePath({
        x1: fromPos.x, y1: fromPos.y,
        x2: toPos.x, y2: toPos.y,
      }, tautness)

      const hitPath = svg.querySelector(`[data-cable-id="${cable.id}"]`) as SVGPathElement | null
      hitPath?.setAttribute('d', d)
      const visualPath = svg.querySelector(`[data-cable-visual="${cable.id}"]`) as SVGPathElement | null
      visualPath?.setAttribute('d', d)
    }

    // update drag preview cable
    const preview = svg.querySelector('[data-cable-preview]') as SVGPathElement | null
    if (preview && dragState) {
      const fromPos = portPositionCache.get(dragState.fromModuleId, dragState.fromPortId)
      if (fromPos) {
        preview.setAttribute('d', cablePath({
          x1: fromPos.x, y1: fromPos.y,
          x2: dragState.cursorX, y2: dragState.cursorY,
        }, tautness))
        preview.style.display = ''
      }
    } else if (preview) {
      preview.style.display = 'none'
    }
  }, [cables, tautness, dragState])

  // subscribe to port position changes for live cable updates during drag
  useLayoutEffect(() => {
    updatePaths()
    return portPositionCache.subscribe(updatePaths)
  }, [updatePaths])

  // resolve cable color from the "from" port type
  function getCableColor(fromModuleId: string, fromPortId: string): string {
    const mod = modules[fromModuleId]
    if (!mod) return 'var(--shade2)'
    const def = getModule(mod.definitionId)
    if (!def) return 'var(--shade2)'
    const port = def.outputs[fromPortId] ?? def.inputs[fromPortId]
    return port ? CABLE_COLORS[port.type] : 'var(--shade2)'
  }

  const handleCableContextMenu = useCallback((e: React.MouseEvent, cableId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ cableId, x: e.clientX, y: e.clientY })
  }, [])

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
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          overflow: 'visible',
        }}
      >
        {Object.values(cables).map((cable) => {
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
                fill="none"
                stroke="transparent"
                strokeWidth={HIT_STROKE_WIDTH}
                strokeLinecap="round"
                style={{ pointerEvents: cablePointerEvents, cursor: 'pointer' }}
                onMouseEnter={() => setHoveredCable(cable.id)}
                onMouseLeave={() => setHoveredCable(null)}
                onContextMenu={(e) => handleCableContextMenu(e, cable.id)}
              />
              {/* visible cable */}
              <path
                data-cable-visual={cable.id}
                fill="none"
                stroke={getCableColor(cable.from.moduleId, cable.from.portId)}
                strokeWidth={isHovered ? 3 : 1.5}
                strokeLinecap="round"
                strokeDasharray={isFeedback ? '8 4' : undefined}
                opacity={hasHover && !isHovered ? 0.25 : 0.9}
                style={{
                  pointerEvents: 'none',
                  transition: 'opacity 100ms, stroke-width 80ms',
                }}
              />
            </g>
          )
        })}
        {/* drag preview cable */}
        <path
          data-cable-preview=""
          fill="none"
          stroke={dragState
            ? CABLE_COLORS[dragState.portType]
            : 'var(--shade2)'
          }
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray="6 4"
          opacity={0.6}
          style={{ display: 'none' }}
        />
      </svg>

      {/* cable context menu — portalled to document.body to escape the rack's CSS transform */}
      {contextMenu && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
          }}
          onMouseDown={() => setContextMenu(null)}
        >
          <div
            style={{
              position: 'fixed',
              left: contextMenu.x,
              top: contextMenu.y,
              background: 'var(--shade1)',
              border: '1px solid var(--shade2)',
              borderRadius: 3,
              padding: '2px 0',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              zIndex: 201,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div
              onClick={handleDisconnect}
              style={{
                padding: '4px 16px',
                fontSize: 'var(--text-sm)',
                color: 'var(--accent2)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLDivElement).style.background = 'var(--shade2)'
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLDivElement).style.background = 'transparent'
              }}
            >
              disconnect
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
