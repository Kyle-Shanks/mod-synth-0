import { useRef, useCallback, useEffect } from 'react'
import { useStore } from '../store'
import { getModule } from '../modules/registry'
import { Port } from './Port'
import { Knob } from './Knob'
import { portPositionCache } from '../cables/PortPositionCache'
import { GRID_UNIT } from '../theme/tokens'

interface ModulePanelProps {
  moduleId: string
}

export function ModulePanel({ moduleId }: ModulePanelProps) {
  const mod = useStore((s) => s.modules[moduleId])
  const setModulePosition = useStore((s) => s.setModulePosition)
  const setSelectedModule = useStore((s) => s.setSelectedModule)
  const selectedModuleId = useStore((s) => s.selectedModuleId)
  const cables = useStore((s) => s.cables)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    origX: number
    origY: number
  } | null>(null)

  const def = mod ? getModule(mod.definitionId) : undefined

  // update all port positions after render / position change
  const updatePortPositions = useCallback(() => {
    const panel = panelRef.current
    if (!panel) return
    panel.querySelectorAll<HTMLDivElement>('[data-port-id]').forEach((el) => {
      const fn = (el as HTMLDivElement & { _updatePortPosition?: () => void })
        ._updatePortPosition
      fn?.()
    })
  }, [])

  useEffect(() => {
    updatePortPositions()
  }, [mod?.position, updatePortPositions])

  // --- drag handling ---
  const handleHeaderMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!mod) return
      e.preventDefault()
      setSelectedModule(moduleId)
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: mod.position.x,
        origY: mod.position.y,
      }

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return
        const dx = ev.clientX - dragRef.current.startX
        const dy = ev.clientY - dragRef.current.startY
        const newX = dragRef.current.origX + Math.round(dx / GRID_UNIT)
        const newY = dragRef.current.origY + Math.round(dy / GRID_UNIT)
        setModulePosition(moduleId, { x: newX, y: newY })
        // update port positions on next frame for cable redraw
        requestAnimationFrame(updatePortPositions)
      }

      const handleMouseUp = () => {
        dragRef.current = null
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    },
    [mod, setSelectedModule, moduleId, setModulePosition, updatePortPositions],
  )

  // clean up port cache on unmount
  useEffect(() => {
    return () => {
      portPositionCache.deleteModule(moduleId)
    }
  }, [moduleId])

  if (!mod || !def) return null

  const isSelected = selectedModuleId === moduleId
  const widthPx = def.width * GRID_UNIT
  const heightPx = def.height * GRID_UNIT

  const inputPorts = Object.entries(def.inputs)
  const outputPorts = Object.entries(def.outputs)
  const paramEntries = Object.entries(def.params)

  // check which ports are connected
  const connectedPorts = new Set<string>()
  for (const cable of Object.values(cables)) {
    if (cable.from.moduleId === moduleId) connectedPorts.add(cable.from.portId)
    if (cable.to.moduleId === moduleId) connectedPorts.add(cable.to.portId)
  }

  return (
    <div
      ref={panelRef}
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
      onMouseDown={() => setSelectedModule(moduleId)}
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
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--shade2)' }}>
          {def.category}
        </span>
      </div>

      {/* params body */}
      {paramEntries.length > 0 && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            justifyContent: 'center',
            gap: 4,
            padding: '6px 4px',
            overflow: 'hidden',
          }}
        >
          {paramEntries.map(([paramId, paramDef]) => (
            <Knob
              key={paramId}
              moduleId={moduleId}
              paramId={paramId}
              definition={paramDef}
              value={mod.params[paramId] ?? paramDef.default}
            />
          ))}
        </div>
      )}

      {/* spacer if no params */}
      {paramEntries.length === 0 && <div style={{ flex: 1 }} />}

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
                    type={portDef.type}
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
                    type={portDef.type}
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
