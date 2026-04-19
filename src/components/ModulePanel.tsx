import { useRef, useCallback, useEffect } from 'react'
import type React from 'react'
import type { CSSProperties } from 'react'
import { useStore } from '../store'
import { getModule } from '../modules/registry'
import { renderModuleBodyPanel } from '../modules/panelRegistry'
import { Port } from './Port'
import { SubpatchPanel } from './SubpatchPanel'
import { portPositionCache } from '../cables/PortPositionCache'
import { GRID_UNIT } from '../theme/tokens'
import { isSubpatchContainer } from '../store/subpatchSlice'
import { RACK_COLS, RACK_ROWS } from '../rack/rackBounds'
import { classes } from '../utils/classes'
import styles from './ModulePanel.module.css'
import modulePanelBaseStyles from '../styles/modulePanelBase.module.css'

interface ModulePanelProps {
  moduleId: string
}

const FALLBACK_MODULE_WIDTH = 3
const FALLBACK_MODULE_HEIGHT = 4
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

interface ModuleDragState {
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

export function ModulePanel({ moduleId }: ModulePanelProps) {
  const mod = useStore((s) => s.modules[moduleId])
  const setModulesPositions = useStore((s) => s.setModulesPositions)
  const setSelectedModule = useStore((s) => s.setSelectedModule)
  const setSelectedModules = useStore((s) => s.setSelectedModules)
  const selectedModuleIds = useStore((s) => s.selectedModuleIds)
  const cables = useStore((s) => s.cables)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<ModuleDragState | null>(null)
  const snapTrackFrameRef = useRef<number | null>(null)

  const def = mod ? getModule(mod.definitionId) : undefined

  // update all port positions after render / position change
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
  }, [mod?.position, moduleId, updatePortPositions])

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
      let minOffsetX = Number.NEGATIVE_INFINITY
      let maxOffsetX = Number.POSITIVE_INFINITY
      let minOffsetY = Number.NEGATIVE_INFINITY
      let maxOffsetY = Number.POSITIVE_INFINITY
      for (const id of moduleIds) {
        const selectedModule = state.modules[id]
        if (!selectedModule) continue
        const moduleDef = getModule(selectedModule.definitionId)
        const width = isSubpatchContainer(selectedModule)
          ? selectedModule.containerWidth
          : moduleDef?.width ?? FALLBACK_MODULE_WIDTH
        const height = isSubpatchContainer(selectedModule)
          ? selectedModule.containerHeight
          : moduleDef?.height ?? FALLBACK_MODULE_HEIGHT
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
      if (dragModuleIds.length === 0) {
        return
      }

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

      const applyPositions = (nextPositions: Record<string, { x: number; y: number }>): boolean => {
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

          // Snap only on release. Try nearest rounded offsets first, then search nearby
          // integer offsets to keep "never overlap / never out of bounds" guarantees.
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

          // Always include original placement as a guaranteed valid fallback.
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

  if (!mod) return null

  // subpatch container — delegate to SubpatchPanel
  if (isSubpatchContainer(mod)) {
    return <SubpatchPanel moduleId={moduleId} />
  }

  const isGridAligned =
    Math.abs(mod.position.x - Math.round(mod.position.x)) <= DRAG_EPSILON &&
    Math.abs(mod.position.y - Math.round(mod.position.y)) <= DRAG_EPSILON
  const isSelected = selectedModuleIds.includes(moduleId)

  const panelPositionStyle = (width: number, height: number) =>
    ({
      '--panel-left': `${mod.position.x * GRID_UNIT}px`,
      '--panel-top': `${mod.position.y * GRID_UNIT}px`,
      '--panel-width': `${width}px`,
      '--panel-height': `${height}px`,
    }) as CSSProperties

  // missing module — definition not in registry, show placeholder
  if (!def) {
    const placeholderW = 3 * GRID_UNIT
    const placeholderH = 4 * GRID_UNIT
    return (
      <div
        ref={panelRef}
        data-module-panel=''
        data-module-panel-id={moduleId}
        className={classes(
          modulePanelBaseStyles.panelBase,
          styles.missingPanel,
          isGridAligned && styles.panelSnapAnimating,
          isSelected && styles.missingPanelSelected,
        )}
        style={panelPositionStyle(placeholderW, placeholderH)}
        onMouseDown={handlePanelMouseDown}
      >
        <div
          onMouseDown={handleHeaderMouseDown}
          className={classes(
            modulePanelBaseStyles.headerBase,
            styles.missingHeader,
            isSelected && styles.missingHeaderSelected,
          )}
        >
          missing
        </div>
        <div className={styles.missingBody}>
          <span className={styles.missingDefId}>{mod.definitionId}</span>
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
      className={classes(
        modulePanelBaseStyles.panelBase,
        styles.panel,
        isGridAligned && styles.panelSnapAnimating,
        isSelected && styles.panelSelected,
      )}
      style={panelPositionStyle(widthPx, heightPx)}
      onMouseDown={handlePanelMouseDown}
    >
      {/* header */}
      <div
        onMouseDown={handleHeaderMouseDown}
        className={classes(modulePanelBaseStyles.headerBase, styles.header)}
      >
        <span>{def.name}</span>
      </div>

      {renderModuleBodyPanel(def.id, moduleId)}

      {/* ports section */}
      {(inputPorts.length > 0 || outputPorts.length > 0) && (
        <div className={classes(modulePanelBaseStyles.portsSectionBase, styles.portsSection)}>
          {/* inputs */}
          {inputPorts.length > 0 && (
            <div className={classes(modulePanelBaseStyles.inputPortsBase, styles.inputPorts)}>
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
              className={classes(
                modulePanelBaseStyles.outputPortsBase,
                styles.outputPorts,
                inputPorts.length > 0
                  ? modulePanelBaseStyles.outputPortsWithInputsBase
                  : modulePanelBaseStyles.outputPortsFullBase,
                inputPorts.length > 0
                  ? styles.outputPortsWithInputs
                  : styles.outputPortsFull,
              )}
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
