import { useRef, useCallback, useEffect, useState } from 'react'
import { useStore } from '../store'
import { ModulePanel } from '../components/ModulePanel'
import { SubpatchBreadcrumb } from '../components/SubpatchBreadcrumb'
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
  const copyModulesToClipboard = useStore((s) => s.copyModulesToClipboard)
  const pasteModulesFromClipboard = useStore((s) => s.pasteModulesFromClipboard)
  const subpatchContext = useStore((s) => s.subpatchContext)
  const groupModulesAsSubpatch = useStore((s) => s.groupModulesAsSubpatch)
  const isInsideSubpatch = subpatchContext.length > 0
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
    ;(document.activeElement as HTMLElement)?.blur()
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

  const [groupContextMenu, setGroupContextMenu] = useState<{ x: number; y: number; gridPos: { x: number; y: number } } | null>(null)

  // right-click: open command palette OR "group as subpatch" if modules are selected
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const rack = rackRef.current
    if (!rack) return
    const rect = rack.getBoundingClientRect()
    const gridPos = {
      x: Math.round((e.clientX - rect.left) / zoom / GRID_UNIT),
      y: Math.round((e.clientY - rect.top) / zoom / GRID_UNIT),
    }

    // if multiple modules are selected and we right-click on empty space OR on a module
    // within the selection, show the group menu
    const sel = useStore.getState().selectedModuleIds
    const target = e.target as HTMLElement
    const clickedPanel = target.closest<HTMLElement>('[data-module-panel]')
    const clickedModuleId = clickedPanel?.getAttribute('data-module-panel-id') ?? null
    const clickedIsInSelection = clickedModuleId !== null && sel.includes(clickedModuleId)
    if (sel.length > 1 && !isInsideSubpatch && (!clickedPanel || clickedIsInSelection)) {
      setGroupContextMenu({ x: e.clientX, y: e.clientY, gridPos })
      return
    }

    // right-click on non-selection targets does nothing (command palette uses space/slash)
  }, [zoom, isInsideSubpatch])

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
      if (e.key === 'Escape') {
        e.preventDefault()
        if (useStore.getState().subpatchContext.length > 0) {
          useStore.getState().exitSubpatch()
        }
        return
      }

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
        return
      }

      const isMac = navigator.platform.toUpperCase().includes('MAC')
      const mod = isMac ? e.metaKey : e.ctrlKey
      const key = e.key.toLowerCase()

      if (mod && !e.shiftKey && key === 'c') {
        if (selectedModuleIds.length > 0) {
          e.preventDefault()
          copyModulesToClipboard(selectedModuleIds)
        }
        return
      }

      if (mod && !e.shiftKey && key === 'v') {
        e.preventDefault()
        const rack = rackRef.current
        const mousePos = lastMousePosRef.current
        if (rack && mousePos) {
          const rect = rack.getBoundingClientRect()
          const gridX = Math.max(
            0,
            Math.round((mousePos.x - rect.left) / zoom / GRID_UNIT),
          )
          const gridY = Math.max(
            0,
            Math.round((mousePos.y - rect.top) / zoom / GRID_UNIT),
          )
          pasteModulesFromClipboard({ x: gridX, y: gridY })
        } else {
          pasteModulesFromClipboard()
        }
        return
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedModuleIds.length > 0) {
        e.preventDefault()
        removeModules(selectedModuleIds)
        setSelectedModules([])
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    copyModulesToClipboard,
    pasteModulesFromClipboard,
    setCommandPaletteOpen,
    selectedModuleIds,
    removeModules,
    setSelectedModules,
    zoom,
  ])

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

  // filter which module IDs to render:
  // - at root: hide proxy modules (they only appear inside subpatches)
  // - inside subpatch: show all modules (including proxies of the current definition)
  const visibleModuleIds = Object.keys(modules).filter((id) => {
    const mod = modules[id]
    if (!mod) return false
    if (!isInsideSubpatch) {
      // hide proxy modules that got orphaned or were somehow added to root
      if (mod.definitionId === 'subpatch-input' || mod.definitionId === 'subpatch-output') return false
      // hide container modules that belong to a different subpatch context (shouldn't happen, but guard it)
    } else {
      // inside a subpatch: hide root-level containers and non-internal modules
      // only show modules from the current definition (the injected ones + their IDs match the definition)
      const currentDef = subpatchContext[subpatchContext.length - 1]
      if (!currentDef) return false
      const def = useStore.getState().definitions[currentDef.definitionId]
      if (!def) return false
      // only show modules that are part of this definition
      return id in def.modules
    }
    return true
  })

  return (
    <div
      ref={outerRef}
      style={{
        flex: 1,
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <SubpatchBreadcrumb />
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
          {visibleModuleIds.map((moduleId) => (
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

      {/* "group as subpatch" context menu */}
      {groupContextMenu && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 200 }}
            onMouseDown={() => setGroupContextMenu(null)}
          />
          <div
            style={{
              position: 'fixed',
              left: groupContextMenu.x,
              top: groupContextMenu.y,
              zIndex: 201,
              background: 'var(--shade1)',
              border: '1px solid var(--shade2)',
              borderRadius: 4,
              overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
              minWidth: 180,
            }}
          >
            <div
              style={{
                padding: '8px 12px',
                fontSize: 'var(--text-xs)',
                color: 'var(--shade2)',
                borderBottom: '1px solid var(--shade2)',
              }}
            >
              {selectedModuleIds.length} modules selected
            </div>
            <div
              onClick={() => {
                const sel = useStore.getState().selectedModuleIds
                groupModulesAsSubpatch(sel, 'untitled')
                setGroupContextMenu(null)
                setSelectedModules([])
              }}
              style={{
                padding: '8px 12px',
                fontSize: 'var(--text-sm)',
                color: 'var(--shade3)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'var(--accent0)'; (e.target as HTMLElement).style.color = 'var(--shade0)' }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.background = ''; (e.target as HTMLElement).style.color = 'var(--shade3)' }}
            >
              group as subpatch
            </div>
          </div>
        </>
      )}
    </div>
  )
}
