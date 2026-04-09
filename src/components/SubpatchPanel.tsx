import { useRef, useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type React from 'react'
import type { CSSProperties } from 'react'
import { useStore } from '../store'
import {
  isSubpatchContainer,
  type SubpatchContainerInstance,
  subpatchInputPortId,
  subpatchOutputPortId,
} from '../store/subpatchSlice'
import { getModule } from '../modules/registry'
import { Port } from './Port'
import { Knob } from './Knob'
import { portPositionCache } from '../cables/PortPositionCache'
import { GRID_UNIT } from '../theme/tokens'
import styles from './SubpatchPanel.module.css'

function classes(...tokens: Array<string | false | null | undefined>): string {
  return tokens.filter(Boolean).join(' ')
}

interface SubpatchPanelProps {
  moduleId: string
}

export function SubpatchPanel({ moduleId }: SubpatchPanelProps) {
  const mod = useStore((s) => s.modules[moduleId])
  const cables = useStore((s) => s.cables)
  const selectedModuleIds = useStore((s) => s.selectedModuleIds)
  const setSelectedModule = useStore((s) => s.setSelectedModule)
  const setSelectedModules = useStore((s) => s.setSelectedModules)
  const setModulesPositions = useStore((s) => s.setModulesPositions)
  const enterSubpatch = useStore((s) => s.enterSubpatch)
  const setMacroValue = useStore((s) => s.setMacroValue)
  const updateDefinitionName = useStore((s) => s.updateDefinitionName)

  const ungroupSubpatch = useStore((s) => s.ungroupSubpatch)
  const saveDefinitionToLibrary = useStore((s) => s.saveDefinitionToLibrary)
  const libraryPresets = useStore((s) => s.libraryPresets)

  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    moduleIds: string[]
    originalPositions: Record<string, { x: number; y: number }>
  } | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
  } | null>(null)

  const container =
    mod && isSubpatchContainer(mod) ? (mod as SubpatchContainerInstance) : null
  const definition = useStore((s) =>
    container ? s.definitions[container.subpatchDefinitionId] : undefined,
  )

  // update port positions whenever the module moves or definition changes
  const updatePortPositions = useCallback((moduleIds: string[]) => {
    const rack = panelRef.current?.closest('[data-rack]')
    if (!rack) return
    for (const id of moduleIds) {
      const panel = rack.querySelector<HTMLElement>(
        `[data-module-panel-id="${id}"]`,
      )
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
  }, [mod?.position, moduleId, updatePortPositions, definition])

  // clean up port cache on unmount
  useEffect(() => {
    return () => {
      portPositionCache.deleteModule(moduleId)
    }
  }, [moduleId])

  const handleEnterSubpatch = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (container && definition) {
        enterSubpatch(moduleId, container.subpatchDefinitionId, definition.name)
      }
    },
    [container, definition, enterSubpatch, moduleId],
  )

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  // drag handling (same pattern as ModulePanel)
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
      if (!draggingSelectedGroup) setSelectedModules([moduleId])

      const originalPositions: Record<string, { x: number; y: number }> = {}
      for (const id of moduleIds) {
        const m = state.modules[id]
        if (m) originalPositions[id] = { x: m.position.x, y: m.position.y }
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
    [
      mod,
      moduleId,
      setModulesPositions,
      setSelectedModules,
      updatePortPositions,
    ],
  )

  const handlePanelMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (selectedModuleIds.length > 1 && selectedModuleIds.includes(moduleId))
        return
      setSelectedModule(moduleId)
    },
    [moduleId, selectedModuleIds, setSelectedModule],
  )

  if (!container || !definition) return null

  const isSelected = selectedModuleIds.includes(moduleId)
  const widthPx = container.containerWidth * GRID_UNIT
  const heightPx = container.containerHeight * GRID_UNIT

  // which ports are connected
  const connectedPorts = new Set<string>()
  for (const cable of Object.values(cables)) {
    if (cable.from.moduleId === moduleId) connectedPorts.add(cable.from.portId)
    if (cable.to.moduleId === moduleId) connectedPorts.add(cable.to.portId)
  }

  const inputPorts = definition.exposedInputs
  const outputPorts = definition.exposedOutputs

  const panelStyle = {
    '--panel-left': `${container.position.x * GRID_UNIT}px`,
    '--panel-top': `${container.position.y * GRID_UNIT}px`,
    '--panel-width': `${widthPx}px`,
    '--panel-height': `${heightPx}px`,
    '--subpatch-border-color': isSelected ? 'var(--accent0)' : 'var(--accent1)',
  } as CSSProperties

  function commitName() {
    const trimmed = nameInput.trim()
    if (trimmed) updateDefinitionName(container!.subpatchDefinitionId, trimmed)
    setEditingName(false)
  }

  return (
    <div
      ref={panelRef}
      data-module-panel=''
      data-module-panel-id={moduleId}
      className={styles.panel}
      style={panelStyle}
      onMouseDown={handlePanelMouseDown}
      onDoubleClick={handleEnterSubpatch}
      onContextMenu={handleContextMenu}
    >
      {contextMenu &&
        createPortal(
          <>
            <div
              className={styles.menuBackdrop}
              onMouseDown={() => setContextMenu(null)}
            />
            <div
              className={styles.menu}
              style={{
                left: contextMenu.x,
                top: contextMenu.y,
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className={styles.menuTitle}>
                {definition.name}
              </div>
              <div
                onClick={() => {
                  setContextMenu(null)
                  const name = definition.name
                  const conflict = Object.values(libraryPresets).find(
                    (p) => p.name === name && p.id !== container.subpatchDefinitionId,
                  )
                  if (conflict && !window.confirm(`overwrite preset "${name}"?`)) return
                  saveDefinitionToLibrary(container.subpatchDefinitionId)
                }}
                className={styles.menuAction}
              >
                save to library
              </div>
              <div
                onClick={() => {
                  setContextMenu(null)
                  ungroupSubpatch(moduleId)
                }}
                className={styles.menuAction}
              >
                ungroup
              </div>
            </div>
          </>,
          document.body,
        )}
      {/* header — drag handle + name */}
      <div
        onMouseDown={handleHeaderMouseDown}
        className={styles.header}
      >
        <span className={styles.caret}>▶</span>
        {editingName ? (
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName()
              if (e.key === 'Escape') setEditingName(false)
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className={styles.nameInput}
          />
        ) : (
          <span
            className={styles.nameText}
            onDoubleClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              setNameInput(definition.name)
              setEditingName(true)
            }}
            title='double-click to rename'
          >
            {definition.name}
          </span>
        )}
      </div>

      {/* macro knobs */}
      {definition.macros.length > 0 && (
        <div className={styles.macroArea}>
          {definition.macros.map((macro) => {
            // look up the target param definition for range
            const targetMod = definition.modules[macro.targetModuleId]
            const targetModDef = targetMod
              ? getModule(targetMod.definitionId)
              : undefined
            const paramDef = targetModDef?.params[macro.targetParamId]
            if (!paramDef) return null
            const value = container.macroValues[macro.id] ?? paramDef.default
            return (
              <Knob
                key={macro.id}
                moduleId={moduleId}
                paramId={macro.id}
                definition={{ ...paramDef, label: macro.label }}
                value={value}
                onChangeOverride={(v) => setMacroValue(moduleId, macro.id, v)}
              />
            )
          })}
        </div>
      )}

      {/* ports section */}
      {(inputPorts.length > 0 || outputPorts.length > 0) && (
        <div
          className={classes(
            styles.portsSection,
            definition.macros.length === 0 && styles.portsSectionPushBottom,
          )}
        >
          {/* exposed inputs */}
          {inputPorts.length > 0 && (
            <div className={styles.inputs}>
              {inputPorts.map((exposed, i) => (
                <div key={exposed.proxyModuleId}>
                  <Port
                    moduleId={moduleId}
                    portId={subpatchInputPortId(i)}
                    direction='input'
                    type={exposed.type}
                    label={exposed.label}
                    connected={connectedPorts.has(subpatchInputPortId(i))}
                  />
                </div>
              ))}
            </div>
          )}

          {/* exposed outputs */}
          {outputPorts.length > 0 && (
            <div
              className={classes(
                styles.outputs,
                inputPorts.length > 0 ? styles.outputsWithInputs : styles.outputsFull,
              )}
            >
              {outputPorts.map((exposed, i) => (
                <div key={exposed.proxyModuleId}>
                  <Port
                    moduleId={moduleId}
                    portId={subpatchOutputPortId(i)}
                    direction='output'
                    type={exposed.type}
                    label={exposed.label}
                    connected={connectedPorts.has(subpatchOutputPortId(i))}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* "double-click to enter" hint when no ports or macros */}
      {inputPorts.length === 0 &&
        outputPorts.length === 0 &&
        definition.macros.length === 0 && (
          <div className={styles.emptyHint}>
            double-click to edit
          </div>
        )}
    </div>
  )
}
