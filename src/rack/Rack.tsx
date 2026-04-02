import { useRef, useCallback, useEffect } from 'react'
import { useStore } from '../store'
import { ModulePanel } from '../components/ModulePanel'
import { CableLayer } from '../cables/CableLayer'
import { GRID_UNIT } from '../theme/tokens'

const RACK_COLS = 20
const RACK_ROWS = 16

export function Rack() {
  const modules = useStore((s) => s.modules)
  const dragState = useStore((s) => s.dragState)
  const setDragState = useStore((s) => s.setDragState)
  const setCommandPaletteOpen = useStore((s) => s.setCommandPaletteOpen)
  const rackRef = useRef<HTMLDivElement>(null)

  const rackWidth = RACK_COLS * GRID_UNIT
  const rackHeight = RACK_ROWS * GRID_UNIT

  // track cursor for cable drag preview
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState) return
    const rack = rackRef.current
    if (!rack) return
    const rect = rack.getBoundingClientRect()
    setDragState({
      ...dragState,
      cursorX: e.clientX - rect.left,
      cursorY: e.clientY - rect.top,
    })
  }, [dragState, setDragState])

  // cancel drag on mouseup over empty space
  const handleMouseUp = useCallback(() => {
    if (dragState) setDragState(null)
  }, [dragState, setDragState])

  // right-click on empty space opens command palette
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const rack = rackRef.current
    if (!rack) return
    const rect = rack.getBoundingClientRect()
    setCommandPaletteOpen(true, {
      x: Math.round((e.clientX - rect.left) / GRID_UNIT),
      y: Math.round((e.clientY - rect.top) / GRID_UNIT),
    })
  }, [setCommandPaletteOpen])

  const selectedModuleId = useStore((s) => s.selectedModuleId)
  const removeModule = useStore((s) => s.removeModule)
  const setSelectedModule = useStore((s) => s.setSelectedModule)

  // keyboard: space opens command palette, delete removes selected module
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // don't trigger if typing in an input
      if (e.target instanceof HTMLInputElement) return
      if (e.code === 'Space' || e.key === '/') {
        e.preventDefault()
        setCommandPaletteOpen(true, { x: 2, y: 2 })
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedModuleId) {
        e.preventDefault()
        removeModule(selectedModuleId)
        setSelectedModule(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setCommandPaletteOpen, selectedModuleId, removeModule, setSelectedModule])

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        background: 'var(--shade0)',
      }}
    >
      <div
        ref={rackRef}
        data-rack=""
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
        style={{
          position: 'relative',
          width: rackWidth,
          height: rackHeight,
          minWidth: rackWidth,
          minHeight: rackHeight,
          backgroundImage: `
            linear-gradient(var(--shade2) 1px, transparent 1px),
            linear-gradient(90deg, var(--shade2) 1px, transparent 1px)
          `,
          backgroundSize: `${GRID_UNIT}px ${GRID_UNIT}px`,
          backgroundPosition: '-1px -1px',
          opacity: 1,
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

        {/* cable overlay */}
        <CableLayer />
      </div>
    </div>
  )
}
