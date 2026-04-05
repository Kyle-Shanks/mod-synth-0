import { useRef, useCallback, useEffect, useState } from 'react'
import { useStore } from '../store'
import { ModulePanel } from '../components/ModulePanel'
import { CableLayer } from '../cables/CableLayer'
import { Tooltip } from '../components/Tooltip'
import { GRID_UNIT } from '../theme/tokens'
import { useZoom } from './ZoomController'
import { getModule } from '../modules/registry'

const RACK_COLS = 64
const RACK_ROWS = 32
const FALLBACK_MODULE_WIDTH = 3
const FALLBACK_MODULE_HEIGHT = 4

interface SelectionDrag {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

export function Rack() {
  const modules = useStore((s) => s.modules)
  const dragState = useStore((s) => s.dragState)
  const setDragState = useStore((s) => s.setDragState)
  const setCommandPaletteOpen = useStore((s) => s.setCommandPaletteOpen)
  const selectedModuleIds = useStore((s) => s.selectedModuleIds)
  const setSelectedModules = useStore((s) => s.setSelectedModules)
  const removeModules = useStore((s) => s.removeModules)
  const rackRef = useRef<HTMLDivElement>(null)
  const outerRef = useRef<HTMLDivElement>(null)
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null)
  const [selectionDrag, setSelectionDrag] = useState<SelectionDrag | null>(null)
  const zoom = useZoom(outerRef)

  const rackWidth = RACK_COLS * GRID_UNIT
  const rackHeight = RACK_ROWS * GRID_UNIT

  const getRackPoint = useCallback((clientX: number, clientY: number) => {
    const rack = rackRef.current
    if (!rack) return null
    const rect = rack.getBoundingClientRect()
    const x = (clientX - rect.left) / zoom
    const y = (clientY - rect.top) / zoom
    return {
      x: Math.max(0, Math.min(rackWidth, x)),
      y: Math.max(0, Math.min(rackHeight, y)),
    }
  }, [zoom, rackWidth, rackHeight])

  const getIntersectingModuleIds = useCallback((left: number, top: number, right: number, bottom: number) => {
    const hits: string[] = []
    for (const [moduleId, mod] of Object.entries(modules)) {
      const def = getModule(mod.definitionId)
      const width = (def?.width ?? FALLBACK_MODULE_WIDTH) * GRID_UNIT
      const height = (def?.height ?? FALLBACK_MODULE_HEIGHT) * GRID_UNIT
      const moduleLeft = mod.position.x * GRID_UNIT
      const moduleTop = mod.position.y * GRID_UNIT
      const moduleRight = moduleLeft + width
      const moduleBottom = moduleTop + height
      const intersects =
        left < moduleRight &&
        right > moduleLeft &&
        top < moduleBottom &&
        bottom > moduleTop
      if (intersects) hits.push(moduleId)
    }
    return hits
  }, [modules])

  // track cursor position always (for command palette spawn position)
  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      lastMousePosRef.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener('mousemove', handleWindowMouseMove)
    return () => window.removeEventListener('mousemove', handleWindowMouseMove)
  }, [])

  // track cursor for cable drag preview
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState) return
    const rack = rackRef.current
    if (!rack) return
    const rect = rack.getBoundingClientRect()
    setDragState({
      ...dragState,
      cursorX: (e.clientX - rect.left) / zoom,
      cursorY: (e.clientY - rect.top) / zoom,
    })
  }, [dragState, setDragState, zoom])

  // cancel drag on mouseup over empty space
  const handleMouseUp = useCallback(() => {
    if (dragState) setDragState(null)
  }, [dragState, setDragState])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || dragState) return

    const target = e.target as HTMLElement
    if (
      target.closest('[data-module-panel]') ||
      target.closest('[data-cable-id]') ||
      target.closest('[data-cable-visual]')
    ) {
      return
    }

    const start = getRackPoint(e.clientX, e.clientY)
    if (!start) return

    e.preventDefault()
    const additiveSelection = e.shiftKey
    const baseSelection = additiveSelection ? selectedModuleIds : []
    if (!additiveSelection) setSelectedModules([])

    setSelectionDrag({
      startX: start.x,
      startY: start.y,
      currentX: start.x,
      currentY: start.y,
    })

    const handleWindowMouseMove = (ev: MouseEvent) => {
      const point = getRackPoint(ev.clientX, ev.clientY)
      if (!point) return

      const left = Math.min(start.x, point.x)
      const right = Math.max(start.x, point.x)
      const top = Math.min(start.y, point.y)
      const bottom = Math.max(start.y, point.y)
      const intersectingIds = getIntersectingModuleIds(left, top, right, bottom)

      const nextSelection = additiveSelection
        ? [...new Set([...baseSelection, ...intersectingIds])]
        : intersectingIds

      setSelectionDrag((prev) => (
        prev
          ? {
              ...prev,
              currentX: point.x,
              currentY: point.y,
            }
          : prev
      ))
      setSelectedModules(nextSelection)
    }

    const handleWindowMouseUp = () => {
      window.removeEventListener('mousemove', handleWindowMouseMove)
      window.removeEventListener('mouseup', handleWindowMouseUp)
      setSelectionDrag(null)
    }

    window.addEventListener('mousemove', handleWindowMouseMove)
    window.addEventListener('mouseup', handleWindowMouseUp)
  }, [
    dragState,
    getRackPoint,
    getIntersectingModuleIds,
    selectedModuleIds,
    setSelectedModules,
  ])

  // right-click on empty space opens command palette
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const rack = rackRef.current
    if (!rack) return
    const rect = rack.getBoundingClientRect()
    setCommandPaletteOpen(true, {
      x: Math.round((e.clientX - rect.left) / zoom / GRID_UNIT),
      y: Math.round((e.clientY - rect.top) / zoom / GRID_UNIT),
    })
  }, [setCommandPaletteOpen, zoom])

  // keyboard: space opens command palette near mouse, delete removes selected modules
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // don't trigger if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) return
      if (e.code === 'Space' || e.key === '/') {
        e.preventDefault()
        const rack = rackRef.current
        const mousePos = lastMousePosRef.current
        if (rack && mousePos) {
          const rect = rack.getBoundingClientRect()
          const gridX = Math.max(0, Math.round((mousePos.x - rect.left) / zoom / GRID_UNIT))
          const gridY = Math.max(0, Math.round((mousePos.y - rect.top) / zoom / GRID_UNIT))
          setCommandPaletteOpen(true, { x: gridX, y: gridY })
        } else {
          setCommandPaletteOpen(true, { x: 2, y: 2 })
        }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedModuleIds.length > 0) {
        e.preventDefault()
        removeModules(selectedModuleIds)
        setSelectedModules([])
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setCommandPaletteOpen, selectedModuleIds, removeModules, setSelectedModules, zoom])

  const selectionLeft = selectionDrag
    ? Math.min(selectionDrag.startX, selectionDrag.currentX)
    : 0
  const selectionTop = selectionDrag
    ? Math.min(selectionDrag.startY, selectionDrag.currentY)
    : 0
  const selectionWidth = selectionDrag
    ? Math.abs(selectionDrag.currentX - selectionDrag.startX)
    : 0
  const selectionHeight = selectionDrag
    ? Math.abs(selectionDrag.currentY - selectionDrag.startY)
    : 0

  return (
    <div
      ref={outerRef}
      style={{
        flex: 1,
        overflow: 'auto',
      }}
    >
      <div
        style={{
          width: rackWidth * zoom,
          height: rackHeight * zoom,
        }}
      >
        <div
          ref={rackRef}
          data-rack=""
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onContextMenu={handleContextMenu}
          style={{
            position: 'relative',
            width: rackWidth,
            height: rackHeight,
            transform: `scale(${zoom})`,
            transformOrigin: '0 0',
            backgroundImage: `
              linear-gradient(var(--shade2) 1px, transparent 1px),
              linear-gradient(90deg, var(--shade2) 1px, transparent 1px)
            `,
            backgroundSize: `${GRID_UNIT}px ${GRID_UNIT}px`,
            backgroundPosition: '-1px -1px',
          }}
        >
          {/* grid overlay at 0.15 opacity */}
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `
              linear-gradient(rgba(42,42,46,0.3) 1px, transparent 1px),
              linear-gradient(90deg, rgba(42,42,46,0.3) 1px, transparent 1px)
            `,
            backgroundSize: `${GRID_UNIT}px ${GRID_UNIT}px`,
            backgroundPosition: '-1px -1px',
            pointerEvents: 'none',
          }} />

          {/* modules */}
          {Object.keys(modules).map((moduleId) => (
            <ModulePanel key={moduleId} moduleId={moduleId} />
          ))}

          {/* marquee selection rectangle */}
          {selectionDrag && (
            <div
              style={{
                position: 'absolute',
                left: selectionLeft,
                top: selectionTop,
                width: selectionWidth,
                height: selectionHeight,
                border: '1px solid var(--accent0)',
                background: 'color-mix(in srgb, var(--accent0) 18%, transparent)',
                pointerEvents: 'none',
                zIndex: 4,
              }}
            />
          )}

          {/* cable overlay */}
          <CableLayer />

          {/* port tooltip */}
          <Tooltip />
        </div>
      </div>
    </div>
  )
}
