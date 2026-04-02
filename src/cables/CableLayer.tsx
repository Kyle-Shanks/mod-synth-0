import { useRef, useLayoutEffect, useCallback } from 'react'
import { useStore } from '../store'
import { portPositionCache } from './PortPositionCache'
import { cablePath } from './CableBezier'
import type { PortType } from '../engine/types'
import { getModule } from '../modules/registry'

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

  const updatePaths = useCallback(() => {
    const svg = svgRef.current
    if (!svg) return

    // update all cable paths
    for (const cable of Object.values(cables)) {
      const path = svg.querySelector(`[data-cable-id="${cable.id}"]`) as SVGPathElement | null
      if (!path) continue

      const fromPos = portPositionCache.get(cable.from.moduleId, cable.from.portId)
      const toPos = portPositionCache.get(cable.to.moduleId, cable.to.portId)
      if (!fromPos || !toPos) continue

      path.setAttribute('d', cablePath({
        x1: fromPos.x, y1: fromPos.y,
        x2: toPos.x, y2: toPos.y,
      }, tautness))
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

  return (
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
      {Object.values(cables).map((cable) => (
        <path
          key={cable.id}
          data-cable-id={cable.id}
          fill="none"
          stroke={getCableColor(cable.from.moduleId, cable.from.portId)}
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0.85}
        />
      ))}
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
  )
}
