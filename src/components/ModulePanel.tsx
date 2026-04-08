import { useRef, useCallback, useEffect } from 'react'
import type React from 'react'
import { useStore } from '../store'
import { getModule } from '../modules/registry'
import { renderModuleBodyPanel } from '../modules/panelRegistry'
import { Port } from './Port'
import { SubpatchPanel } from './SubpatchPanel'
import { portPositionCache } from '../cables/PortPositionCache'
import { GRID_UNIT } from '../theme/tokens'
import { isSubpatchContainer } from '../store/subpatchSlice'

interface ModulePanelProps {
  moduleId: string
}

export function ModulePanel({ moduleId }: ModulePanelProps) {
  const mod = useStore((s) => s.modules[moduleId])
  const setModulesPositions = useStore((s) => s.setModulesPositions)
  const setSelectedModule = useStore((s) => s.setSelectedModule)
  const setSelectedModules = useStore((s) => s.setSelectedModules)
  const selectedModuleIds = useStore((s) => s.selectedModuleIds)
  const cables = useStore((s) => s.cables)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    moduleIds: string[]
    originalPositions: Record<string, { x: number; y: number }>
  } | null>(null)

  const def = mod ? getModule(mod.definitionId) : undefined

  // update all port positions after render / position change
  const updatePortPositions = useCallback((moduleIds: string[]) => {
    const rack = panelRef.current?.closest('[data-rack]')
    if (!rack) return
    for (const id of moduleIds) {
      const panel = rack.querySelector<HTMLElement>(`[data-module-panel-id="${id}"]`)
      if (!panel) continue
      panel.querySelectorAll<HTMLDivElement>('[data-port-id]').forEach((el) => {
        const fn = (el as HTMLDivElement & { _updatePortPosition?: () => void })
          ._updatePortPosition
        fn?.()
      })
    }
  }, [])

  useEffect(() => {
    updatePortPositions([moduleId])
  }, [mod?.position, moduleId, updatePortPositions])

  // --- drag handling ---
  const handleHeaderMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!mod) return
      e.preventDefault()
      e.stopPropagation()
      ;(document.activeElement as HTMLElement)?.blur()

      const state = useStore.getState()
      const currentSelection = state.selectedModuleIds
      const draggingSelectedGroup =
        currentSelection.length > 0 && currentSelection.includes(moduleId)
      const moduleIds = draggingSelectedGroup ? currentSelection : [moduleId]

      if (!draggingSelectedGroup) {
        setSelectedModules([moduleId])
      }

      const originalPositions: Record<string, { x: number; y: number }> = {}
      for (const id of moduleIds) {
        const selectedModule = state.modules[id]
        if (!selectedModule) continue
        originalPositions[id] = {
          x: selectedModule.position.x,
          y: selectedModule.position.y,
        }
      }

      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        moduleIds: Object.keys(originalPositions),
        originalPositions,
      }

      useStore.getState().stageHistory()

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return
        const dx = ev.clientX - dragRef.current.startX
        const dy = ev.clientY - dragRef.current.startY
        // mouse deltas are in viewport (scaled) pixels; divide by zoom to get logical pixels,
        // then divide by GRID_UNIT to convert to grid units
        const z = useStore.getState().zoom
        const offsetX = Math.round(dx / z / GRID_UNIT)
        const offsetY = Math.round(dy / z / GRID_UNIT)

        const nextPositions: Record<string, { x: number; y: number }> = {}
        for (const id of dragRef.current.moduleIds) {
          const original = dragRef.current.originalPositions[id]
          if (!original) continue
          nextPositions[id] = {
            x: original.x + offsetX,
            y: original.y + offsetY,
          }
        }

        setModulesPositions(nextPositions)
        // update port positions on next frame for cable redraw
        requestAnimationFrame(() => {
          if (!dragRef.current) return
          updatePortPositions(dragRef.current.moduleIds)
        })
      }

      const handleMouseUp = () => {
        dragRef.current = null
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
        useStore.getState().commitHistory()
      }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    },
    [mod, moduleId, setModulesPositions, setSelectedModules, updatePortPositions],
  )

  const handlePanelMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (selectedModuleIds.length > 1 && selectedModuleIds.includes(moduleId)) {
      return
    }
    setSelectedModule(moduleId)
  }, [moduleId, selectedModuleIds, setSelectedModule])

  // clean up port cache on unmount
  useEffect(() => {
    return () => {
      portPositionCache.deleteModule(moduleId)
    }
  }, [moduleId])

  if (!mod) return null

  // subpatch container — delegate to SubpatchPanel
  if (isSubpatchContainer(mod)) {
    return <SubpatchPanel moduleId={moduleId} />
  }

  const isSelected = selectedModuleIds.includes(moduleId)

  // missing module — definition not in registry, show placeholder
  if (!def) {
    const placeholderW = 3 * GRID_UNIT
    const placeholderH = 4 * GRID_UNIT
    return (
      <div
        ref={panelRef}
        data-module-panel=''
        data-module-panel-id={moduleId}
        style={{
          position: 'absolute',
          left: mod.position.x * GRID_UNIT,
          top: mod.position.y * GRID_UNIT,
          width: placeholderW,
          height: placeholderH,
          background: 'var(--shade1)',
          border: `1px dashed ${isSelected ? 'var(--accent0)' : 'var(--shade2)'}`,
          borderRadius: 2,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          opacity: 0.6,
        }}
        onMouseDown={handlePanelMouseDown}
      >
        <div
          onMouseDown={handleHeaderMouseDown}
          style={{
            padding: '4px 6px',
            fontSize: 'var(--text-sm)',
            color: isSelected ? 'var(--accent0)' : 'var(--shade2)',
            cursor: 'grab',
            borderBottom: `1px dashed ${isSelected ? 'var(--accent0)' : 'var(--shade2)'}`,
            flexShrink: 0,
          }}
        >
          missing
        </div>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 8,
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--shade2)' }}>
            {mod.definitionId}
          </span>
        </div>
      </div>
    )
  }

  const widthPx = def.width * GRID_UNIT
  const heightPx = def.height * GRID_UNIT

  // filter hidden ports (they still exist in the worklet but aren't shown in the UI)
  const inputPorts = Object.entries(def.inputs).filter(([, pd]) => !pd.hidden)
  const outputPorts = Object.entries(def.outputs).filter(([, pd]) => !pd.hidden)

  // if the module instance has a data.portType, use it as an override for all visible ports
  const portTypeOverride = (() => {
    const t = mod.data?.portType
    if (t === 'audio' || t === 'cv' || t === 'gate' || t === 'trigger') return t
    return undefined
  })()

  // check which ports are connected
  const connectedPorts = new Set<string>()
  for (const cable of Object.values(cables)) {
    if (cable.from.moduleId === moduleId) connectedPorts.add(cable.from.portId)
    if (cable.to.moduleId === moduleId) connectedPorts.add(cable.to.portId)
  }

  return (
    <div
      ref={panelRef}
      data-module-panel=''
      data-module-panel-id={moduleId}
      style={{
        position: 'absolute',
        left: mod.position.x * GRID_UNIT,
        top: mod.position.y * GRID_UNIT,
        width: widthPx,
        height: heightPx,
        background: 'var(--shade1)',
        border: `1px solid ${isSelected ? 'var(--accent0)' : 'var(--shade2)'}`,
        borderRadius: 2,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
      onMouseDown={handlePanelMouseDown}
    >
      {/* header */}
      <div
        onMouseDown={handleHeaderMouseDown}
        style={{
          padding: '4px 6px',
          fontSize: 'var(--text-sm)',
          color: 'var(--shade3)',
          cursor: 'grab',
          borderBottom: '1px solid var(--shade2)',
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>{def.name}</span>
        {/* <span style={{ fontSize: 'var(--text-xs)', color: 'var(--shade2)' }}>
          {def.category}
        </span> */}
      </div>

      {renderModuleBodyPanel(def.id, moduleId)}

      {/* ports section */}
      {(inputPorts.length > 0 || outputPorts.length > 0) && (
        <div
          style={{
            borderTop: '1px solid var(--shade2)',
            display: 'flex',
            flexShrink: 0,
          }}
        >
          {/* inputs */}
          {inputPorts.length > 0 && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 4,
                padding: '6px 4px',
                justifyContent: 'center',
              }}
            >
              {inputPorts.map(([id, portDef]) => (
                <div key={id}>
                  <Port
                    moduleId={moduleId}
                    portId={id}
                    direction='input'
                    type={portTypeOverride ?? portDef.type}
                    label={portDef.label}
                    connected={connectedPorts.has(id)}
                  />
                </div>
              ))}
            </div>
          )}

          {/* output inset */}
          {outputPorts.length > 0 && (
            <div
              style={{
                background: 'var(--shade3)',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 4,
                padding: '6px 4px',
                justifyContent: 'center',
                borderLeft:
                  inputPorts.length > 0 ? '1px solid var(--shade2)' : undefined,
              }}
            >
              {outputPorts.map(([id, portDef]) => (
                <div key={id}>
                  <Port
                    moduleId={moduleId}
                    portId={id}
                    direction='output'
                    type={portTypeOverride ?? portDef.type}
                    label={portDef.label}
                    connected={connectedPorts.has(id)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
