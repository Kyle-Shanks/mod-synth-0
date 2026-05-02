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
import { RACK_COLS, RACK_ROWS } from '../rack/rackBounds'
import { classes } from '../utils/classes'
import styles from './SubpatchPanel.module.css'
import modulePanelBaseStyles from '../styles/modulePanelBase.module.css'
import contextMenuStyles from '../styles/contextMenuBase.module.css'
import controlPrimitiveStyles from '../styles/controlPrimitives.module.css'

interface SubpatchPanelProps {
  moduleId: string
}

const DRAG_EPSILON = 1e-4
const AUTO_PAN_EDGE_PX = 96
const AUTO_PAN_MAX_STEP_PX = 18

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function autoPanVelocity(pointer: number, min: number, max: number): number {
  if (pointer < min + AUTO_PAN_EDGE_PX) {
    const t = clamp((min + AUTO_PAN_EDGE_PX - pointer) / AUTO_PAN_EDGE_PX, 0, 1)
    return -AUTO_PAN_MAX_STEP_PX * t * t
  }
  if (pointer > max - AUTO_PAN_EDGE_PX) {
    const t = clamp((pointer - (max - AUTO_PAN_EDGE_PX)) / AUTO_PAN_EDGE_PX, 0, 1)
    return AUTO_PAN_MAX_STEP_PX * t * t
  }
  return 0
}

interface SubpatchDragState {
  startX: number
  startY: number
  startScrollLeft: number
  startScrollTop: number
  latestX: number
  latestY: number
  moduleIds: string[]
  originalPositions: Record<string, { x: number; y: number }>
  minOffsetX: number
  maxOffsetX: number
  minOffsetY: number
  maxOffsetY: number
  lastOffsetX: number
  lastOffsetY: number
  frameId: number | null
  portFrameId: number | null
}

export function SubpatchPanel({ moduleId }: SubpatchPanelProps) {
  const mod = useStore((s) => s.modules[moduleId])
  const connectedPortKey = useStore((s) => {
    const connected = new Set<string>()
    for (const cable of Object.values(s.cables)) {
      if (cable.from.moduleId === moduleId) connected.add(cable.from.portId)
      if (cable.to.moduleId === moduleId) connected.add(cable.to.portId)
    }
    return [...connected].sort().join('|')
  })
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
  const dragRef = useRef<SubpatchDragState | null>(null)
  const snapTrackFrameRef = useRef<number | null>(null)
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
    portPositionCache.batch(() => {
      for (const id of moduleIds) {
        const panel = rack.querySelector<HTMLElement>(`[data-module-panel-id="${id}"]`)
        if (!panel) continue
        panel.querySelectorAll<HTMLDivElement>('[data-port-id]').forEach((el) => {
          const fn = (el as HTMLDivElement & { _updatePortPosition?: () => void })
            ._updatePortPosition
          fn?.()
        })
      }
    })
  }, [])

  useEffect(() => {
    updatePortPositions([moduleId])
  }, [mod?.position, moduleId, updatePortPositions, definition])

  // Keep cable endpoints in lockstep with CSS left/top snap transitions.
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const isTrackedProperty = (propertyName: string) =>
      propertyName === 'left' || propertyName === 'top'

    const startTracking = (event: Event) => {
      const e = event as TransitionEvent
      if (!isTrackedProperty(e.propertyName)) return
      if (snapTrackFrameRef.current !== null) return
      const tick = () => {
        updatePortPositions([moduleId])
        snapTrackFrameRef.current = requestAnimationFrame(tick)
      }
      tick()
    }

    const stopTracking = (event: Event) => {
      const e = event as TransitionEvent
      if (!isTrackedProperty(e.propertyName)) return
      if (snapTrackFrameRef.current !== null) {
        cancelAnimationFrame(snapTrackFrameRef.current)
        snapTrackFrameRef.current = null
      }
      updatePortPositions([moduleId])
    }

    panel.addEventListener('transitionstart', startTracking)
    panel.addEventListener('transitionend', stopTracking)
    panel.addEventListener('transitioncancel', stopTracking)
    return () => {
      panel.removeEventListener('transitionstart', startTracking)
      panel.removeEventListener('transitionend', stopTracking)
      panel.removeEventListener('transitioncancel', stopTracking)
    }
  }, [moduleId, updatePortPositions])

  // clean up port cache on unmount
  useEffect(() => {
    return () => {
      const drag = dragRef.current
      if (drag && drag.frameId !== null) {
        cancelAnimationFrame(drag.frameId)
      }
      if (drag && drag.portFrameId !== null) {
        cancelAnimationFrame(drag.portFrameId)
      }
      if (snapTrackFrameRef.current !== null) {
        cancelAnimationFrame(snapTrackFrameRef.current)
      }
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

  // drag handling (mirrors ModulePanel behavior: smooth free-drag, snap on release)
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
      let minOffsetX = Number.NEGATIVE_INFINITY
      let maxOffsetX = Number.POSITIVE_INFINITY
      let minOffsetY = Number.NEGATIVE_INFINITY
      let maxOffsetY = Number.POSITIVE_INFINITY
      for (const id of moduleIds) {
        const selectedModule = state.modules[id]
        if (!selectedModule) continue
        const width = isSubpatchContainer(selectedModule)
          ? selectedModule.containerWidth
          : (getModule(selectedModule.definitionId)?.width ?? 3)
        const height = isSubpatchContainer(selectedModule)
          ? selectedModule.containerHeight
          : (getModule(selectedModule.definitionId)?.height ?? 4)
        originalPositions[id] = {
          x: selectedModule.position.x,
          y: selectedModule.position.y,
        }
        minOffsetX = Math.max(minOffsetX, -selectedModule.position.x)
        maxOffsetX = Math.min(
          maxOffsetX,
          RACK_COLS - width - selectedModule.position.x,
        )
        minOffsetY = Math.max(minOffsetY, -selectedModule.position.y)
        maxOffsetY = Math.min(
          maxOffsetY,
          RACK_ROWS - height - selectedModule.position.y,
        )
      }

      const dragModuleIds = Object.keys(originalPositions)
      if (dragModuleIds.length === 0) return

      const scrollContainer = panelRef.current?.closest<HTMLElement>(
        '[data-rack-scroll-container]',
      )
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startScrollLeft: scrollContainer?.scrollLeft ?? 0,
        startScrollTop: scrollContainer?.scrollTop ?? 0,
        latestX: e.clientX,
        latestY: e.clientY,
        moduleIds: dragModuleIds,
        originalPositions,
        minOffsetX: Number.isFinite(minOffsetX) ? minOffsetX : 0,
        maxOffsetX: Number.isFinite(maxOffsetX) ? maxOffsetX : 0,
        minOffsetY: Number.isFinite(minOffsetY) ? minOffsetY : 0,
        maxOffsetY: Number.isFinite(maxOffsetY) ? maxOffsetY : 0,
        lastOffsetX: 0,
        lastOffsetY: 0,
        frameId: null,
        portFrameId: null,
      }
      useStore.getState().stageHistory()

      const buildPositionsForOffset = (offsetX: number, offsetY: number) => {
        const nextPositions: Record<string, { x: number; y: number }> = {}
        for (const id of dragModuleIds) {
          const original = originalPositions[id]
          if (!original) continue
          nextPositions[id] = {
            x: original.x + offsetX,
            y: original.y + offsetY,
          }
        }
        return nextPositions
      }

      const applyPositions = (
        nextPositions: Record<string, { x: number; y: number }>,
      ): boolean => {
        setModulesPositions(nextPositions)

        const leadModuleId = dragModuleIds[0]
        const expectedLead = leadModuleId ? nextPositions[leadModuleId] : undefined
        const appliedLead = leadModuleId
          ? useStore.getState().modules[leadModuleId]?.position
          : undefined
        const moveApplied = !!(
          expectedLead &&
          appliedLead &&
          Math.abs(expectedLead.x - appliedLead.x) <= DRAG_EPSILON &&
          Math.abs(expectedLead.y - appliedLead.y) <= DRAG_EPSILON
        )
        return moveApplied
      }

      const applyOffsetStrict = (offsetX: number, offsetY: number): boolean => {
        const nextPositions = buildPositionsForOffset(offsetX, offsetY)
        return applyPositions(nextPositions)
      }

      const applyOffsetWithSlide = (
        desiredOffsetX: number,
        desiredOffsetY: number,
        lastOffsetX: number,
        lastOffsetY: number,
      ): { applied: boolean; offsetX: number; offsetY: number } => {
        if (applyOffsetStrict(desiredOffsetX, desiredOffsetY)) {
          return { applied: true, offsetX: desiredOffsetX, offsetY: desiredOffsetY }
        }

        const deltaX = Math.abs(desiredOffsetX - lastOffsetX)
        const deltaY = Math.abs(desiredOffsetY - lastOffsetY)
        const preferXAxis = deltaX >= deltaY
        const fallbackCandidates = preferXAxis
          ? [
              { x: desiredOffsetX, y: lastOffsetY },
              { x: lastOffsetX, y: desiredOffsetY },
            ]
          : [
              { x: lastOffsetX, y: desiredOffsetY },
              { x: desiredOffsetX, y: lastOffsetY },
            ]

        for (const candidate of fallbackCandidates) {
          const sameAsLast =
            Math.abs(candidate.x - lastOffsetX) <= DRAG_EPSILON &&
            Math.abs(candidate.y - lastOffsetY) <= DRAG_EPSILON
          if (sameAsLast) continue
          if (applyOffsetStrict(candidate.x, candidate.y)) {
            return { applied: true, offsetX: candidate.x, offsetY: candidate.y }
          }
        }

        return {
          applied: false,
          offsetX: lastOffsetX,
          offsetY: lastOffsetY,
        }
      }

      const applyDragFrame = () => {
        const drag = dragRef.current
        if (!drag) return
        drag.frameId = null

        const scrollHost = panelRef.current?.closest<HTMLElement>(
          '[data-rack-scroll-container]',
        )
        let panVelocityX = 0
        let panVelocityY = 0
        if (scrollHost) {
          const rect = scrollHost.getBoundingClientRect()
          panVelocityX = autoPanVelocity(drag.latestX, rect.left, rect.right)
          panVelocityY = autoPanVelocity(drag.latestY, rect.top, rect.bottom)

          const maxScrollLeft = Math.max(0, scrollHost.scrollWidth - scrollHost.clientWidth)
          const maxScrollTop = Math.max(0, scrollHost.scrollHeight - scrollHost.clientHeight)
          const nextScrollLeft = clamp(
            scrollHost.scrollLeft + panVelocityX,
            0,
            maxScrollLeft,
          )
          const nextScrollTop = clamp(
            scrollHost.scrollTop + panVelocityY,
            0,
            maxScrollTop,
          )
          if (Math.abs(nextScrollLeft - scrollHost.scrollLeft) > DRAG_EPSILON) {
            scrollHost.scrollLeft = nextScrollLeft
          }
          if (Math.abs(nextScrollTop - scrollHost.scrollTop) > DRAG_EPSILON) {
            scrollHost.scrollTop = nextScrollTop
          }
        }

        const z = useStore.getState().zoom
        const scrollDeltaX = (scrollHost?.scrollLeft ?? drag.startScrollLeft) - drag.startScrollLeft
        const scrollDeltaY = (scrollHost?.scrollTop ?? drag.startScrollTop) - drag.startScrollTop
        const dx = drag.latestX - drag.startX + scrollDeltaX
        const dy = drag.latestY - drag.startY + scrollDeltaY
        const offsetX = clamp(dx / z / GRID_UNIT, drag.minOffsetX, drag.maxOffsetX)
        const offsetY = clamp(dy / z / GRID_UNIT, drag.minOffsetY, drag.maxOffsetY)
        const unchanged =
          Math.abs(offsetX - drag.lastOffsetX) <= DRAG_EPSILON &&
          Math.abs(offsetY - drag.lastOffsetY) <= DRAG_EPSILON
        if (!unchanged) {
          const applied = applyOffsetWithSlide(
            offsetX,
            offsetY,
            drag.lastOffsetX,
            drag.lastOffsetY,
          )
          if (applied.applied) {
            drag.lastOffsetX = applied.offsetX
            drag.lastOffsetY = applied.offsetY

            if (drag.portFrameId !== null) cancelAnimationFrame(drag.portFrameId)
            drag.portFrameId = requestAnimationFrame(() => {
              const activeDrag = dragRef.current
              if (!activeDrag) return
              activeDrag.portFrameId = null
              updatePortPositions(activeDrag.moduleIds)
            })
          }
        }

        if (
          dragRef.current &&
          (Math.abs(panVelocityX) > DRAG_EPSILON ||
            Math.abs(panVelocityY) > DRAG_EPSILON) &&
          dragRef.current.frameId === null
        ) {
          dragRef.current.frameId = requestAnimationFrame(applyDragFrame)
        }
      }

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return
        dragRef.current.latestX = ev.clientX
        dragRef.current.latestY = ev.clientY
        if (dragRef.current.frameId !== null) return
        dragRef.current.frameId = requestAnimationFrame(applyDragFrame)
      }

      const handleMouseUp = (ev: MouseEvent) => {
        const drag = dragRef.current
        if (drag) {
          drag.latestX = ev.clientX
          drag.latestY = ev.clientY
          if (drag.frameId !== null) {
            cancelAnimationFrame(drag.frameId)
            drag.frameId = null
          }
          applyDragFrame()
          if (drag.portFrameId !== null) {
            cancelAnimationFrame(drag.portFrameId)
            drag.portFrameId = null
          }

          // Snap only on release. Try nearest rounded offsets first, then search nearby.
          const scrollHost = panelRef.current?.closest<HTMLElement>(
            '[data-rack-scroll-container]',
          )
          const z = useStore.getState().zoom
          const scrollDeltaX =
            (scrollHost?.scrollLeft ?? drag.startScrollLeft) - drag.startScrollLeft
          const scrollDeltaY =
            (scrollHost?.scrollTop ?? drag.startScrollTop) - drag.startScrollTop
          const rawOffsetX = clamp(
            (drag.latestX - drag.startX + scrollDeltaX) / z / GRID_UNIT,
            drag.minOffsetX,
            drag.maxOffsetX,
          )
          const rawOffsetY = clamp(
            (drag.latestY - drag.startY + scrollDeltaY) / z / GRID_UNIT,
            drag.minOffsetY,
            drag.maxOffsetY,
          )

          const roundedX = Math.round(rawOffsetX)
          const roundedY = Math.round(rawOffsetY)
          const floorX = Math.floor(rawOffsetX)
          const ceilX = Math.ceil(rawOffsetX)
          const floorY = Math.floor(rawOffsetY)
          const ceilY = Math.ceil(rawOffsetY)

          const candidateKeys = new Set<string>()
          const candidates: Array<{ x: number; y: number }> = []
          const addCandidate = (x: number, y: number) => {
            const cx = clamp(Math.round(x), drag.minOffsetX, drag.maxOffsetX)
            const cy = clamp(Math.round(y), drag.minOffsetY, drag.maxOffsetY)
            const key = `${cx}:${cy}`
            if (candidateKeys.has(key)) return
            candidateKeys.add(key)
            candidates.push({ x: cx, y: cy })
          }

          addCandidate(roundedX, roundedY)
          addCandidate(floorX, roundedY)
          addCandidate(ceilX, roundedY)
          addCandidate(roundedX, floorY)
          addCandidate(roundedX, ceilY)
          addCandidate(floorX, floorY)
          addCandidate(floorX, ceilY)
          addCandidate(ceilX, floorY)
          addCandidate(ceilX, ceilY)

          const maxRadius = Math.max(
            Math.abs(roundedX - Math.round(drag.minOffsetX)),
            Math.abs(roundedX - Math.round(drag.maxOffsetX)),
            Math.abs(roundedY - Math.round(drag.minOffsetY)),
            Math.abs(roundedY - Math.round(drag.maxOffsetY)),
          )
          for (let radius = 1; radius <= maxRadius; radius++) {
            for (let ox = -radius; ox <= radius; ox++) {
              for (let oy = -radius; oy <= radius; oy++) {
                if (Math.abs(ox) !== radius && Math.abs(oy) !== radius) continue
                addCandidate(roundedX + ox, roundedY + oy)
              }
            }
          }

          addCandidate(0, 0)

          for (const candidate of candidates) {
            if (applyOffsetStrict(candidate.x, candidate.y)) break
          }

          updatePortPositions(drag.moduleIds)
        }
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

  const isGridAligned =
    Math.abs(container.position.x - Math.round(container.position.x)) <= DRAG_EPSILON &&
    Math.abs(container.position.y - Math.round(container.position.y)) <= DRAG_EPSILON
  const isSelected = selectedModuleIds.includes(moduleId)
  const widthPx = container.containerWidth * GRID_UNIT
  const heightPx = container.containerHeight * GRID_UNIT

  // which ports are connected
  const connectedPorts = new Set(
    connectedPortKey ? connectedPortKey.split('|') : [],
  )

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
      className={classes(
        modulePanelBaseStyles.panelBase,
        styles.panel,
        isGridAligned && styles.panelSnapAnimating,
      )}
      style={panelStyle}
      onMouseDown={handlePanelMouseDown}
      onDoubleClick={handleEnterSubpatch}
      onContextMenu={handleContextMenu}
    >
      {contextMenu &&
        createPortal(
          <>
            <div
              className={classes(contextMenuStyles.backdrop, styles.menuBackdrop)}
              onMouseDown={() => setContextMenu(null)}
            />
            <div
              className={classes(contextMenuStyles.menu, styles.menu)}
              style={{
                left: contextMenu.x,
                top: contextMenu.y,
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className={classes(contextMenuStyles.menuTitle, styles.menuTitle)}>
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
                className={classes(contextMenuStyles.menuItem, styles.menuAction)}
              >
                save to library
              </div>
              <div
                onClick={() => {
                  setContextMenu(null)
                  ungroupSubpatch(moduleId)
                }}
                className={classes(contextMenuStyles.menuItem, styles.menuAction)}
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
        className={classes(modulePanelBaseStyles.headerBase, styles.header)}
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
            className={classes(
              controlPrimitiveStyles.panelInputBase,
              styles.nameInput,
            )}
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
            modulePanelBaseStyles.portsSectionBase,
            styles.portsSection,
            definition.macros.length === 0 && styles.portsSectionPushBottom,
          )}
        >
          {/* exposed inputs */}
          {inputPorts.length > 0 && (
            <div className={classes(modulePanelBaseStyles.inputPortsBase, styles.inputs)}>
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
                modulePanelBaseStyles.outputPortsBase,
                styles.outputs,
                inputPorts.length > 0
                  ? modulePanelBaseStyles.outputPortsWithInputsBase
                  : modulePanelBaseStyles.outputPortsFullBase,
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
