import type { StateCreator } from 'zustand'
import type { SerializedCable, SubpatchDefinition } from '../engine/types'
import { engine } from '../engine/EngineController'
import { getModule } from '../modules/registry'
import { clampPositionToRack, isPositionWithinRack } from '../rack/rackBounds'
import type { StoreState } from './index'
import {
  isSubpatchContainer,
  computeContainerSize,
  resolveContainerPort,
  _expandInstance,
  _collapseInstance,
  type SubpatchContainerInstance,
} from './subpatchSlice'

export interface ModuleInstance {
  definitionId: string
  position: { x: number; y: number }
  params: Record<string, number>
  data?: Record<string, string>
}

export interface PatchSlice {
  patchName: string
  modules: Record<string, ModuleInstance>
  cables: Record<string, SerializedCable>
  feedbackCableIds: Set<string>
  setPatchName: (name: string) => void
  addModule: (definitionId: string, position: { x: number; y: number }) => string
  removeModule: (moduleId: string) => void
  removeModules: (moduleIds: string[]) => void
  addCable: (cable: SerializedCable) => void
  removeCable: (cableId: string) => void
  setParam: (moduleId: string, param: string, value: number) => void
  setModuleDataValue: (moduleId: string, key: string, value: string) => void
  setModulePosition: (moduleId: string, position: { x: number; y: number }) => void
  setModulesPositions: (positions: Record<string, { x: number; y: number }>) => void
  copyModulesToClipboard: (moduleIds: string[]) => void
  pasteModulesFromClipboard: (targetPosition?: { x: number; y: number }) => string[]
  loadPatch: (
    name: string,
    modules: Record<string, ModuleInstance>,
    cables: Record<string, SerializedCable>,
    definitions?: Record<string, SubpatchDefinition>,
  ) => void
  clearPatch: () => void
  // subpatch container actions
  addSubpatchContainer: (defId: string, position: { x: number; y: number }) => string
  groupModulesAsSubpatch: (moduleIds: string[], name: string) => string
  ungroupSubpatch: (instanceId: string) => void
}

let moduleCounter = 0
const rootAdjacency = new Map<string, Set<string>>()

function ensureAdjNode(adjacency: Map<string, Set<string>>, moduleId: string): Set<string> {
  let outgoing = adjacency.get(moduleId)
  if (!outgoing) {
    outgoing = new Set<string>()
    adjacency.set(moduleId, outgoing)
  }
  return outgoing
}

function addAdjEdge(
  adjacency: Map<string, Set<string>>,
  fromModuleId: string,
  toModuleId: string,
): void {
  ensureAdjNode(adjacency, fromModuleId).add(toModuleId)
  ensureAdjNode(adjacency, toModuleId)
}

function removeAdjEdge(
  adjacency: Map<string, Set<string>>,
  fromModuleId: string,
  toModuleId: string,
): void {
  adjacency.get(fromModuleId)?.delete(toModuleId)
}

function removeAdjNode(adjacency: Map<string, Set<string>>, moduleId: string): void {
  adjacency.delete(moduleId)
  for (const outgoing of adjacency.values()) {
    outgoing.delete(moduleId)
  }
}

function hasParallelCableEdge(
  cables: Record<string, SerializedCable>,
  cableIdToSkip: string,
  fromModuleId: string,
  toModuleId: string,
): boolean {
  for (const [cableId, cable] of Object.entries(cables)) {
    if (cableId === cableIdToSkip) continue
    if (
      cable.from.moduleId === fromModuleId &&
      cable.to.moduleId === toModuleId
    ) {
      return true
    }
  }
  return false
}

function cloneAdjacency(adjacency: Map<string, Set<string>>): Map<string, Set<string>> {
  const copy = new Map<string, Set<string>>()
  for (const [from, outgoing] of adjacency) {
    copy.set(from, new Set(outgoing))
  }
  return copy
}

function rebuildRootAdjacency(
  modules: Record<string, ModuleInstance>,
  cables: Record<string, SerializedCable>,
): void {
  rootAdjacency.clear()
  for (const moduleId of Object.keys(modules)) {
    ensureAdjNode(rootAdjacency, moduleId)
  }
  for (const cable of Object.values(cables)) {
    addAdjEdge(rootAdjacency, cable.from.moduleId, cable.to.moduleId)
  }
}

function createCableId(cables: Record<string, SerializedCable>): string {
  let id = ''
  do {
    id = `cable-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  } while (cables[id])
  return id
}

// get the grid dimensions of any module (regular or subpatch container)
function getModuleSize(m: ModuleInstance): { width: number; height: number } | null {
  if (isSubpatchContainer(m)) return { width: m.containerWidth, height: m.containerHeight }
  const def = getModule(m.definitionId)
  return def ? { width: def.width, height: def.height } : null
}

// check if a module at `pos` with `width`x`height` overlaps any existing module
export function wouldOverlap(
  modules: Record<string, ModuleInstance>,
  pos: { x: number; y: number },
  width: number,
  height: number,
  excludeIds?: Set<string>,
): boolean {
  for (const [id, m] of Object.entries(modules)) {
    if (excludeIds?.has(id)) continue
    const size = getModuleSize(m)
    if (!size) continue
    const noOverlap =
      pos.x + width <= m.position.x ||
      m.position.x + size.width <= pos.x ||
      pos.y + height <= m.position.y ||
      m.position.y + size.height <= pos.y
    if (!noOverlap) return true
  }
  return false
}

// find the nearest non-overlapping position by scanning outward
export function findFreePosition(
  modules: Record<string, ModuleInstance>,
  pos: { x: number; y: number },
  width: number,
  height: number,
  excludeIds?: Set<string>,
): { x: number; y: number } {
  const clampedStart = clampPositionToRack(pos, width, height)
  if (!wouldOverlap(modules, clampedStart, width, height, excludeIds)) return clampedStart
  for (let radius = 1; radius <= 20; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue
        const candidate = { x: clampedStart.x + dx, y: clampedStart.y + dy }
        if (!isPositionWithinRack(candidate, width, height)) continue
        if (!wouldOverlap(modules, candidate, width, height, excludeIds)) return candidate
      }
    }
  }
  return clampedStart // give up after 20 grid units
}

// detect if adding a cable creates a cycle in the patch graph
function detectsCycle(cables: Record<string, SerializedCable>, newCable: SerializedCable): boolean {
  // check if there's a path from newCable.to.moduleId back to newCable.from.moduleId
  const visited = new Set<string>()
  const queue = [newCable.to.moduleId]
  while (queue.length > 0) {
    const current = queue.pop()!
    if (current === newCable.from.moduleId) return true
    if (visited.has(current)) continue
    visited.add(current)
    // find all modules that this module feeds into
    for (const c of Object.values(cables)) {
      if (c.from.moduleId === current && !visited.has(c.to.moduleId)) {
        queue.push(c.to.moduleId)
      }
    }
  }
  return false
}

function detectsCycleWithAdj(
  adjacency: Map<string, Set<string>>,
  newCable: SerializedCable,
): boolean {
  if (newCable.from.moduleId === newCable.to.moduleId) return true
  const visited = new Set<string>()
  const queue = [newCable.to.moduleId]
  while (queue.length > 0) {
    const current = queue.pop()
    if (!current) continue
    if (current === newCable.from.moduleId) return true
    if (visited.has(current)) continue
    visited.add(current)
    const outgoing = adjacency.get(current)
    if (!outgoing) continue
    for (const next of outgoing) {
      if (!visited.has(next)) queue.push(next)
    }
  }
  return false
}

// translate a cable's endpoints: if either end is a subpatch container port,
// map it to the corresponding proxy module port for the worklet
function resolveWorkletCable(cable: SerializedCable, state: StoreState): SerializedCable {
  const fromMod = state.modules[cable.from.moduleId]
  const toMod = state.modules[cable.to.moduleId]
  let from = cable.from
  let to = cable.to
  if (fromMod && isSubpatchContainer(fromMod)) {
    const def = state.definitions[fromMod.subpatchDefinitionId]
    if (def) from = resolveContainerPort(cable.from.moduleId, cable.from.portId, def)
  }
  if (toMod && isSubpatchContainer(toMod)) {
    const def = state.definitions[toMod.subpatchDefinitionId]
    if (def) to = resolveContainerPort(cable.to.moduleId, cable.to.portId, def)
  }
  return { ...cable, from, to }
}

export const createPatchSlice: StateCreator<StoreState, [], [], PatchSlice> = (set, get) => ({
  patchName: 'untitled patch',
  modules: {},
  cables: {},
  feedbackCableIds: new Set<string>(),

  setPatchName(name) {
    set({ patchName: name })
  },

  addModule(definitionId, position) {
    // when inside a subpatch, route to definition-aware add
    const ctx = get().subpatchContext
    if (ctx.length > 0) {
      const defId = ctx[ctx.length - 1]!.definitionId
      const newId = get().addModuleToDefinition(defId, definitionId, position)
      if (!newId) return ''
      // inject newly-added module into state.modules so it renders in the drilled-in view
      const newMod = get().definitions[defId]?.modules[newId]
      if (newMod) set((s) => ({ modules: { ...s.modules, [newId]: newMod } }))
      return newId
    }

    get().pushHistory()
    const def = getModule(definitionId)
    if (!def) return ''

    const id = `${definitionId}-${++moduleCounter}`
    const params: Record<string, number> = {}
    for (const [key, param] of Object.entries(def.params)) {
      params[key] = param.default
    }
    const state = def.initialize({ sampleRate: engine.sampleRate, bufferSize: 128 })

    // Only consider root-level modules for overlap — exclude any internal subpatch modules
    // that may be present in state (e.g. from an injected drill-down).
    const internalIds = new Set<string>()
    for (const d of Object.values(get().definitions)) {
      for (const k of Object.keys(d.modules)) internalIds.add(k)
    }
    const rootModules = Object.fromEntries(
      Object.entries(get().modules).filter(([k]) => !internalIds.has(k))
    )
    const freePos = findFreePosition(rootModules, position, def.width, def.height)

    engine.addModule({ id, definitionId, params, state, position: freePos }, def)
    ensureAdjNode(rootAdjacency, id)

    set((s) => ({
      modules: { ...s.modules, [id]: { definitionId, position: freePos, params } }
    }))
    return id
  },

  removeModule(moduleId) {
    get().removeModules([moduleId])
  },

  removeModules(moduleIds) {
    // when inside a subpatch, route to definition-aware remove
    const ctx = get().subpatchContext
    if (ctx.length > 0) {
      const defId = ctx[ctx.length - 1]!.definitionId
      for (const moduleId of moduleIds) {
        get().removeModuleFromDefinition(defId, moduleId)
        // also remove from injected state.modules and any connected cables
        set((s) => {
          const modules = { ...s.modules }
          const cables: Record<string, SerializedCable> = {}
          const feedbackCableIds = new Set(s.feedbackCableIds)
          delete modules[moduleId]
          for (const [cid, cable] of Object.entries(s.cables)) {
            if (cable.from.moduleId === moduleId || cable.to.moduleId === moduleId) {
              feedbackCableIds.delete(cid)
            } else {
              cables[cid] = cable
            }
          }
          return { modules, cables, feedbackCableIds }
        })
      }
      return
    }

    const existingIds = [...new Set(moduleIds)].filter((id) => !!get().modules[id])
    if (existingIds.length === 0) return

    get().pushHistory()
    const removeSet = new Set(existingIds)

    for (const moduleId of existingIds) {
      const mod = get().modules[moduleId]
      if (mod && isSubpatchContainer(mod)) {
        // collapse internal modules and their worklet representations first
        _collapseInstance(moduleId, mod.subpatchDefinitionId, get())
      } else {
        engine.removeModule(moduleId)
      }
    }

    // remove any cables connected to removed modules
    for (const [cableId, cable] of Object.entries(get().cables)) {
      if (removeSet.has(cable.from.moduleId) || removeSet.has(cable.to.moduleId)) {
        engine.removeCable(cableId)
        removeAdjEdge(rootAdjacency, cable.from.moduleId, cable.to.moduleId)
      }
    }

    for (const moduleId of existingIds) {
      removeAdjNode(rootAdjacency, moduleId)
    }

    set((s) => {
      const modules = { ...s.modules }
      for (const moduleId of existingIds) delete modules[moduleId]

      const remainingCables: Record<string, SerializedCable> = {}
      const nextFeedback = new Set(s.feedbackCableIds)
      for (const [cid, cable] of Object.entries(s.cables)) {
        if (removeSet.has(cable.from.moduleId) || removeSet.has(cable.to.moduleId)) {
          nextFeedback.delete(cid)
        } else {
          remainingCables[cid] = cable
        }
      }

      return { modules, cables: remainingCables, feedbackCableIds: nextFeedback }
    })
  },

  addCable(cable) {
    // when inside a subpatch, route to definition-aware add
    const ctx = get().subpatchContext
    if (ctx.length > 0) {
      const defId = ctx[ctx.length - 1]!.definitionId
      get().addCableToDefinition(defId, cable)
      // also add to injected state.cables for rendering
      set((s) => ({ cables: { ...s.cables, [cable.id]: cable } }))
      return
    }

    get().pushHistory()
    const isFeedback = detectsCycleWithAdj(rootAdjacency, cable)
    const workletCable = resolveWorkletCable(cable, get())
    engine.addCable(workletCable, isFeedback)
    addAdjEdge(rootAdjacency, cable.from.moduleId, cable.to.moduleId)
    set((s) => {
      const newFeedback = new Set(s.feedbackCableIds)
      if (isFeedback) newFeedback.add(cable.id)
      return { cables: { ...s.cables, [cable.id]: cable }, feedbackCableIds: newFeedback }
    })
  },

  removeCable(cableId) {
    const ctx = get().subpatchContext
    if (ctx.length > 0) {
      const defId = ctx[ctx.length - 1]!.definitionId
      get().removeCableFromDefinition(defId, cableId)
      set((s) => {
        const cables = { ...s.cables }
        const feedbackCableIds = new Set(s.feedbackCableIds)
        delete cables[cableId]
        feedbackCableIds.delete(cableId)
        return { cables, feedbackCableIds }
      })
      return
    }

    get().pushHistory()
    const cable = get().cables[cableId]
    engine.removeCable(cableId)
    if (cable) {
      const hasParallel = hasParallelCableEdge(
        get().cables,
        cableId,
        cable.from.moduleId,
        cable.to.moduleId,
      )
      if (!hasParallel) {
        removeAdjEdge(rootAdjacency, cable.from.moduleId, cable.to.moduleId)
      }
    }
    set((s) => {
      const cables = { ...s.cables }
      const feedbackCableIds = new Set(s.feedbackCableIds)
      delete cables[cableId]
      feedbackCableIds.delete(cableId)
      return { cables, feedbackCableIds }
    })
  },

  setParam(moduleId, param, value) {
    const ctx = get().subpatchContext
    if (ctx.length > 0) {
      const defId = ctx[ctx.length - 1]!.definitionId
      get().setParamInDefinition(defId, moduleId, param, value)
      // also update state.modules for immediate knob feedback
      set((s) => {
        const mod = s.modules[moduleId]
        if (!mod) return s
        return { modules: { ...s.modules, [moduleId]: { ...mod, params: { ...mod.params, [param]: value } } } }
      })
      return
    }

    engine.setParam(moduleId, param, value)
    set((s) => {
      const mod = s.modules[moduleId]
      if (!mod) return s
      return {
        modules: {
          ...s.modules,
          [moduleId]: { ...mod, params: { ...mod.params, [param]: value } }
        }
      }
    })
  },

  setModuleDataValue(moduleId, key, value) {
    const ctx = get().subpatchContext
    if (ctx.length > 0) {
      const defId = ctx[ctx.length - 1]!.definitionId
      get().setModuleDataInDefinition(defId, moduleId, key, value)
      // also update state.modules for immediate rendering
      set((s) => {
        const mod = s.modules[moduleId]
        if (!mod) return s
        return { modules: { ...s.modules, [moduleId]: { ...mod, data: { ...(mod.data ?? {}), [key]: value } } } }
      })
      return
    }

    set((s) => {
      const mod = s.modules[moduleId]
      if (!mod) return s
      const currentValue = mod.data?.[key] ?? ''
      if (currentValue === value) return s
      return {
        modules: {
          ...s.modules,
          [moduleId]: {
            ...mod,
            data: {
              ...(mod.data ?? {}),
              [key]: value,
            },
          },
        },
      }
    })
  },

  copyModulesToClipboard(moduleIds) {
    const uniqueIds = [...new Set(moduleIds)].filter((id) => !!get().modules[id])
    if (uniqueIds.length === 0) {
      set({ moduleClipboard: null, moduleClipboardPasteCount: 0 })
      return
    }

    const selectedSet = new Set(uniqueIds)
    const clipboardModules = uniqueIds.flatMap((id) => {
      const mod = get().modules[id]
      if (!mod) return []
      return {
        sourceId: id,
        definitionId: mod.definitionId,
        position: { ...mod.position },
        params: { ...mod.params },
        data: mod.data ? { ...mod.data } : undefined,
      }
    })

    const clipboardCables = Object.values(get().cables)
      .filter(
        (cable) =>
          selectedSet.has(cable.from.moduleId) &&
          selectedSet.has(cable.to.moduleId),
      )
      .map((cable) => ({
        from: { ...cable.from },
        to: { ...cable.to },
      }))

    set({
      moduleClipboard: {
        modules: clipboardModules,
        cables: clipboardCables,
      },
      moduleClipboardPasteCount: 0,
    })
  },

  pasteModulesFromClipboard(targetPosition) {
    const clipboard = get().moduleClipboard
    if (!clipboard || clipboard.modules.length === 0) return []
    const pasteableItems = clipboard.modules.filter((item) =>
      !!getModule(item.definitionId),
    )
    if (pasteableItems.length === 0) return []

    // ── subpatch branch ───────────────────────────────────────────────────────
    const ctx = get().subpatchContext
    if (ctx.length > 0) {
      const defId = ctx[ctx.length - 1]!.definitionId
      const pasteOffset = get().moduleClipboardPasteCount + 1
      const minX = targetPosition ? Math.min(...pasteableItems.map((i) => i.position.x)) : 0
      const minY = targetPosition ? Math.min(...pasteableItems.map((i) => i.position.y)) : 0
      const idMap = new Map<string, string>()
      const pastedIds: string[] = []

      for (const item of pasteableItems) {
        const requestedPos = targetPosition
          ? { x: Math.max(0, targetPosition.x + (item.position.x - minX)), y: Math.max(0, targetPosition.y + (item.position.y - minY)) }
          : { x: item.position.x + pasteOffset, y: item.position.y + pasteOffset }
        const newId = get().addModuleToDefinition(defId, item.definitionId, requestedPos)
        if (!newId) continue
        for (const [k, v] of Object.entries(item.params ?? {})) {
          get().setParamInDefinition(defId, newId, k, v)
        }
        if (item.data) {
          for (const [k, v] of Object.entries(item.data)) {
            get().setModuleDataInDefinition(defId, newId, k, v)
          }
        }
        // sync injected state.modules entry
        const newMod = get().definitions[defId]?.modules[newId]
        if (newMod) set((s) => ({ modules: { ...s.modules, [newId]: newMod } }))
        idMap.set(item.sourceId, newId)
        pastedIds.push(newId)
      }

      for (const cable of clipboard.cables) {
        const fromId = idMap.get(cable.from.moduleId)
        const toId = idMap.get(cable.to.moduleId)
        if (!fromId || !toId) continue
        get().addCable({
          id: createCableId(get().cables),
          from: { moduleId: fromId, portId: cable.from.portId },
          to: { moduleId: toId, portId: cable.to.portId },
        })
      }

      set({ selectedModuleIds: pastedIds, selectedModuleId: pastedIds[0] ?? null, moduleClipboardPasteCount: pasteOffset })
      return pastedIds
    }
    // ── end subpatch branch ───────────────────────────────────────────────────

    let minClipboardX = 0
    let minClipboardY = 0
    if (targetPosition) {
      minClipboardX = Math.min(...pasteableItems.map((item) => item.position.x))
      minClipboardY = Math.min(...pasteableItems.map((item) => item.position.y))
    }

    // build root-only module map for overlap detection (exclude any injected internal modules)
    const pasteInternalIds = new Set<string>()
    for (const d of Object.values(get().definitions)) {
      for (const k of Object.keys(d.modules)) pasteInternalIds.add(k)
    }
    const nextModules: Record<string, ModuleInstance> = Object.fromEntries(
      Object.entries(get().modules).filter(([k]) => !pasteInternalIds.has(k))
    )
    const nextCables: Record<string, SerializedCable> = { ...get().cables }
    const nextFeedback = new Set(get().feedbackCableIds)
    const nextAdjacency = cloneAdjacency(rootAdjacency)
    const idMap = new Map<string, string>()
    const pastedModuleIds: string[] = []
    const pasteOffset = get().moduleClipboardPasteCount + 1
    const repeatedPasteOffset = targetPosition ? 0 : pasteOffset - 1
    get().pushHistory()

    for (const item of clipboard.modules) {
      const def = getModule(item.definitionId)
      if (!def) continue

      const newId = `${item.definitionId}-${++moduleCounter}`
      const requestedPos = targetPosition
        ? {
            x: Math.max(
              0,
              targetPosition.x + (item.position.x - minClipboardX) + repeatedPasteOffset,
            ),
            y: Math.max(
              0,
              targetPosition.y + (item.position.y - minClipboardY) + repeatedPasteOffset,
            ),
          }
        : {
            x: item.position.x + pasteOffset,
            y: item.position.y + pasteOffset,
          }
      const freePos = findFreePosition(
        nextModules,
        requestedPos,
        def.width,
        def.height,
      )
      const params = { ...item.params }
      const data = item.data ? { ...item.data } : undefined
      const state = def.initialize({ sampleRate: engine.sampleRate, bufferSize: 128 })

      engine.addModule(
        {
          id: newId,
          definitionId: item.definitionId,
          params,
          state,
          position: freePos,
        },
        def,
      )

      nextModules[newId] = data
        ? {
            definitionId: item.definitionId,
            position: freePos,
            params,
            data,
          }
        : {
            definitionId: item.definitionId,
            position: freePos,
            params,
          }

      idMap.set(item.sourceId, newId)
      pastedModuleIds.push(newId)
    }

    if (pastedModuleIds.length === 0) return []

    for (const cable of clipboard.cables) {
      const fromModuleId = idMap.get(cable.from.moduleId)
      const toModuleId = idMap.get(cable.to.moduleId)
      if (!fromModuleId || !toModuleId) continue

      const pastedCable: SerializedCable = {
        id: createCableId(nextCables),
        from: { moduleId: fromModuleId, portId: cable.from.portId },
        to: { moduleId: toModuleId, portId: cable.to.portId },
      }

      const isFeedback = detectsCycleWithAdj(nextAdjacency, pastedCable)
      engine.addCable(pastedCable, isFeedback)
      nextCables[pastedCable.id] = pastedCable
      addAdjEdge(nextAdjacency, pastedCable.from.moduleId, pastedCable.to.moduleId)
      if (isFeedback) nextFeedback.add(pastedCable.id)
    }

    set({
      modules: nextModules,
      cables: nextCables,
      feedbackCableIds: nextFeedback,
      selectedModuleId: pastedModuleIds[0] ?? null,
      selectedModuleIds: pastedModuleIds,
      moduleClipboardPasteCount: pasteOffset,
    })
    rebuildRootAdjacency(nextModules, nextCables)

    return pastedModuleIds
  },

  setModulePosition(moduleId, position) {
    const mod = get().modules[moduleId]
    if (!mod) return
    const size = getModuleSize(mod)
    if (!size) return
    if (!isPositionWithinRack(position, size.width, size.height)) return
    if (wouldOverlap(get().modules, position, size.width, size.height, new Set([moduleId]))) return
    set((s) => ({
      modules: { ...s.modules, [moduleId]: { ...s.modules[moduleId]!, position } }
    }))
  },

  setModulesPositions(positions) {
    const modules = get().modules
    const movingIds = Object.keys(positions).filter((id) => !!modules[id])
    if (movingIds.length === 0) return

    // when inside a subpatch, route to definition-aware position update
    const ctx = get().subpatchContext
    if (ctx.length > 0) {
      const defId = ctx[ctx.length - 1]!.definitionId
      const def = get().definitions[defId]
      if (!def) return
      const defMods = def.modules as Record<string, ModuleInstance>
      const movingSet = new Set(movingIds)
      // check all moves first — reject the whole group if any would overlap
      for (const moduleId of movingIds) {
        const position = positions[moduleId]
        if (!position) continue
        // clamp to non-negative grid positions
        if (position.x < 0 || position.y < 0) return
        const mod = defMods[moduleId]
        if (!mod) continue
        const modDef = getModule(mod.definitionId)
        if (!modDef) continue
        if (!isPositionWithinRack(position, modDef.width, modDef.height)) return
        if (wouldOverlap(defMods, position, modDef.width, modDef.height, movingSet)) return
      }
      // all clear — apply
      for (const moduleId of movingIds) {
        const position = positions[moduleId]
        if (!position) continue
        get().setModulePositionInDefinition(defId, moduleId, position)
        set((s) => {
          const mod = s.modules[moduleId]
          if (!mod) return s
          return { modules: { ...s.modules, [moduleId]: { ...mod, position } } }
        })
      }
      return
    }

    // Exclude internal subpatch modules from overlap detection at root level
    const internalIds2 = new Set<string>()
    for (const d of Object.values(get().definitions)) {
      for (const k of Object.keys(d.modules)) internalIds2.add(k)
    }
    const rootModulesForMove = Object.fromEntries(
      Object.entries(modules).filter(([k]) => !internalIds2.has(k))
    )
    const movingSet = new Set(movingIds)
    for (const moduleId of movingIds) {
      const mod = rootModulesForMove[moduleId]
      if (!mod) continue
      const size = getModuleSize(mod)
      if (!size) continue
      const position = positions[moduleId]
      if (!position) continue
      if (position.x < 0 || position.y < 0) return
      if (!isPositionWithinRack(position, size.width, size.height)) return
      if (wouldOverlap(rootModulesForMove, position, size.width, size.height, movingSet)) return
    }

    set((s) => {
      const nextModules = { ...s.modules }
      for (const moduleId of movingIds) {
        const mod = nextModules[moduleId]
        const position = positions[moduleId]
        if (!mod || !position) continue
        nextModules[moduleId] = { ...mod, position }
      }
      return { modules: nextModules }
    })
  },

  loadPatch(name, modules, cables, definitions) {
    // tear down existing engine state
    const oldState = get()
    for (const cableId of Object.keys(oldState.cables)) {
      engine.removeCable(cableId)
    }
    for (const [moduleId, mod] of Object.entries(oldState.modules)) {
      if (isSubpatchContainer(mod)) {
        // collapse internal modules (already removes external cables above)
        _collapseInstance(moduleId, mod.subpatchDefinitionId, oldState)
      } else {
        engine.removeModule(moduleId)
      }
    }
    get().clearHistory()

    // load subpatch definitions if provided
    if (definitions) {
      set({ definitions })
    }

    // add new modules to the engine
    // update moduleCounter to avoid id collisions with restored modules
    for (const [id, mod] of Object.entries(modules)) {
      const match = id.match(/-(\d+)$/)
      if (match) {
        const num = parseInt(match[1]!, 10)
        if (num >= moduleCounter) moduleCounter = num
      }
      if (isSubpatchContainer(mod)) continue // expanded below
      const def = getModule(mod.definitionId)
      if (!def) continue // missing module — kept in store but not added to engine
      const state = def.initialize({ sampleRate: engine.sampleRate, bufferSize: 128 })
      engine.addModule({ id, definitionId: mod.definitionId, params: mod.params, state, position: mod.position }, def)
    }

    // set store state first so _expandInstance can read definitions/modules/cables
    const feedbackIds = new Set<string>()
    const cablesSoFar: Record<string, SerializedCable> = {}
    const regularCables: Record<string, SerializedCable> = {}
    for (const [cableId, cable] of Object.entries(cables)) {
      cablesSoFar[cableId] = cable
      regularCables[cableId] = cable
    }
    set({
      patchName: name,
      modules,
      cables: regularCables,
      feedbackCableIds: feedbackIds,
    })

    // detect feedback cables and add to engine (with container port translation)
    const stateForCables = get()
    const recalcAdjacency = new Map<string, Set<string>>()
    for (const moduleId of Object.keys(modules)) {
      ensureAdjNode(recalcAdjacency, moduleId)
    }
    for (const [cableId, cable] of Object.entries(cables)) {
      const isFeedback = detectsCycleWithAdj(recalcAdjacency, cable)
      if (isFeedback) feedbackIds.add(cableId)
      // only add cable if both endpoints have valid backing
      const fromMod = modules[cable.from.moduleId]
      const toMod = modules[cable.to.moduleId]
      const fromOk = fromMod && (isSubpatchContainer(fromMod) || !!getModule(fromMod.definitionId))
      const toOk = toMod && (isSubpatchContainer(toMod) || !!getModule(toMod.definitionId))
      if (fromOk && toOk) {
        const workletCable = resolveWorkletCable(cable, stateForCables)
        engine.addCable(workletCable, isFeedback)
      }
      addAdjEdge(recalcAdjacency, cable.from.moduleId, cable.to.moduleId)
    }
    set({ feedbackCableIds: feedbackIds })
    rebuildRootAdjacency(modules, regularCables)

    // expand container instances into worklet
    for (const [instanceId, mod] of Object.entries(modules)) {
      if (!isSubpatchContainer(mod)) continue
      const currentState = get()
      const def = currentState.definitions[mod.subpatchDefinitionId]
      if (!def) continue
      _expandInstance(instanceId, mod, def, currentState)
    }

    get().bumpEngineRevision()
  },

  clearPatch() {
    const oldState = get()
    for (const cableId of Object.keys(oldState.cables)) {
      engine.removeCable(cableId)
    }
    for (const [moduleId, mod] of Object.entries(oldState.modules)) {
      if (isSubpatchContainer(mod)) {
        _collapseInstance(moduleId, mod.subpatchDefinitionId, oldState)
      } else {
        engine.removeModule(moduleId)
      }
    }
    get().clearHistory()
    moduleCounter = 0
    rootAdjacency.clear()
    set({
      patchName: 'untitled patch',
      modules: {},
      cables: {},
      feedbackCableIds: new Set<string>(),
      definitions: {},
    })
  },

  addSubpatchContainer(defId, position) {
    get().pushHistory()
    const state = get()
    const def = state.definitions[defId]
    if (!def) return ''

    const { width, height } = computeContainerSize(def)
    const id = `subpatch-container-${++moduleCounter}`
    const freePos = findFreePosition(state.modules, position, width, height)

    const container: SubpatchContainerInstance = {
      definitionId: '__subpatch__',
      subpatchDefinitionId: defId,
      position: freePos,
      params: {},
      macroValues: {},
      containerWidth: width,
      containerHeight: height,
    }

    set((s) => ({ modules: { ...s.modules, [id]: container } }))
    ensureAdjNode(rootAdjacency, id)

    // expand internal modules into worklet
    _expandInstance(id, container, def, get())

    return id
  },

  groupModulesAsSubpatch(moduleIds, name) {
    const uniqueIds = [...new Set(moduleIds)].filter((id) => !!get().modules[id])
    if (uniqueIds.length === 0) return ''

    get().pushHistory()

    // create a new definition
    const defId = get().createDefinition(name)

    // find the centroid position for the container
    const state = get()
    let sumX = 0, sumY = 0
    for (const id of uniqueIds) {
      const m = state.modules[id]
      if (m) { sumX += m.position.x; sumY += m.position.y }
    }
    const centroid = { x: Math.round(sumX / uniqueIds.length), y: Math.round(sumY / uniqueIds.length) }

    const selectedSet = new Set(uniqueIds)

    // copy internal cables (those with both endpoints inside the selection)
    const internalCables: Record<string, SerializedCable> = {}
    for (const [cid, cable] of Object.entries(state.cables)) {
      if (selectedSet.has(cable.from.moduleId) && selectedSet.has(cable.to.moduleId)) {
        internalCables[cid] = cable
      }
    }

    // move the selected modules into the definition
    const def = get().definitions[defId]!
    const internalModules: SubpatchDefinition['modules'] = {}
    let minInternalX = Infinity
    let minInternalY = Infinity
    for (const id of uniqueIds) {
      const mod = state.modules[id]
      if (!mod || isSubpatchContainer(mod)) continue
      const internalX = mod.position.x - centroid.x + 2
      const internalY = mod.position.y - centroid.y + 2
      internalModules[id] = {
        definitionId: mod.definitionId,
        position: { x: internalX, y: internalY },
        params: { ...mod.params },
        data: mod.data ? { ...mod.data } : undefined,
      }
      minInternalX = Math.min(minInternalX, internalX)
      minInternalY = Math.min(minInternalY, internalY)
    }

    // keep all grouped internals inside non-negative grid coordinates
    if (Number.isFinite(minInternalX) && Number.isFinite(minInternalY)) {
      const shiftX = minInternalX < 0 ? -minInternalX : 0
      const shiftY = minInternalY < 0 ? -minInternalY : 0
      if (shiftX > 0 || shiftY > 0) {
        for (const mod of Object.values(internalModules)) {
          mod.position = {
            x: mod.position.x + shiftX,
            y: mod.position.y + shiftY,
          }
        }
      }
    }

    // update definition with internal modules and cables
    set((s) => ({
      definitions: {
        ...s.definitions,
        [defId]: { ...def, modules: internalModules, cables: internalCables },
      },
    }))

    // remove the selected modules from the root patch (their worklet modules too)
    // don't collapse — they'll be re-added under the container
    for (const id of uniqueIds) {
      const mod = get().modules[id]
      if (!mod) continue
      engine.removeModule(id)
      // remove cables connected to these modules from worklet
      for (const [cid, cable] of Object.entries(get().cables)) {
        if (cable.from.moduleId === id || cable.to.moduleId === id) {
          engine.removeCable(cid)
        }
      }
    }

    // remove selected modules and their associated cables from store
    set((s) => {
      const modules = { ...s.modules }
      const cables: Record<string, SerializedCable> = {}
      const feedbackCableIds = new Set(s.feedbackCableIds)
      for (const id of uniqueIds) delete modules[id]
      for (const [cid, cable] of Object.entries(s.cables)) {
        if (selectedSet.has(cable.from.moduleId) || selectedSet.has(cable.to.moduleId)) {
          feedbackCableIds.delete(cid)
        } else {
          cables[cid] = cable
        }
      }
      return { modules, cables, feedbackCableIds }
    })

    // refresh exposed ports (in case any proxy modules were inside)
    get().refreshExposedPorts(defId)

    // add the container at centroid
    const containerId = get().addSubpatchContainer(defId, centroid)
    const nextState = get()
    rebuildRootAdjacency(nextState.modules, nextState.cables)
    return containerId
  },

  ungroupSubpatch(instanceId) {
    const state = get()
    const container = state.modules[instanceId]
    if (!container || !isSubpatchContainer(container)) return

    get().pushHistory()

    const defId = container.subpatchDefinitionId
    const def = state.definitions[defId]
    if (!def) return

    const containerPos = container.position

    // map internal module ID → new root module ID
    const idMap = new Map<string, string>()

    // place all non-proxy internal modules at root level
    for (const [internalId, internalMod] of Object.entries(def.modules)) {
      const isProxy = internalMod.definitionId === 'subpatch-input' || internalMod.definitionId === 'subpatch-output'
      if (isProxy) continue
      const modDef = getModule(internalMod.definitionId)
      if (!modDef) continue

      const newId = `${internalMod.definitionId}-${++moduleCounter}`
      const absolutePos = {
        x: containerPos.x + internalMod.position.x,
        y: containerPos.y + internalMod.position.y,
      }
      const clampedPos = clampPositionToRack(absolutePos, modDef.width, modDef.height)
      const modState = modDef.initialize({ sampleRate: engine.sampleRate, bufferSize: 128 })
      const params = { ...internalMod.params }
      engine.addModule({ id: newId, definitionId: internalMod.definitionId, params, state: modState, position: clampedPos }, modDef)
      set((s) => ({
        modules: { ...s.modules, [newId]: { definitionId: internalMod.definitionId, position: clampedPos, params, data: internalMod.data } }
      }))
      idMap.set(internalId, newId)
    }

    // rewire internal cables between restored modules
    const nextCables: Record<string, SerializedCable> = { ...get().cables }
    const nextFeedback = new Set(get().feedbackCableIds)
    for (const cable of Object.values(def.cables)) {
      const fromId = idMap.get(cable.from.moduleId)
      const toId = idMap.get(cable.to.moduleId)
      if (!fromId || !toId) continue
      const newCable: SerializedCable = {
        id: createCableId(nextCables),
        from: { moduleId: fromId, portId: cable.from.portId },
        to: { moduleId: toId, portId: cable.to.portId },
      }
      const isFeedback = detectsCycle({ ...nextCables, [newCable.id]: newCable }, newCable)
      engine.addCable(newCable, isFeedback)
      nextCables[newCable.id] = newCable
      if (isFeedback) nextFeedback.add(newCable.id)
    }

    // rewire external cables through proxy modules
    // input proxy: external cable → sp_in_N → proxy.out → internal target
    for (let i = 0; i < def.exposedInputs.length; i++) {
      const exposed = def.exposedInputs[i]!
      const proxyId = exposed.proxyModuleId
      // find what the proxy's out connects to inside
      const internalTarget = Object.values(def.cables).find(
        (c) => c.from.moduleId === proxyId && c.from.portId === 'out'
      )
      const targetRootId = internalTarget ? idMap.get(internalTarget.to.moduleId) : undefined
      if (!targetRootId || !internalTarget) continue
      // reconnect all external cables that were going into sp_in_i
      const portId = `sp_in_${i}`
      for (const [cid, cable] of Object.entries(state.cables)) {
        if (cable.to.moduleId !== instanceId || cable.to.portId !== portId) continue
        const newCable: SerializedCable = {
          id: createCableId(nextCables),
          from: { moduleId: cable.from.moduleId, portId: cable.from.portId },
          to: { moduleId: targetRootId, portId: internalTarget.to.portId },
        }
        const isFeedback = detectsCycle({ ...nextCables, [newCable.id]: newCable }, newCable)
        engine.addCable(newCable, isFeedback)
        nextCables[newCable.id] = newCable
        if (isFeedback) nextFeedback.add(newCable.id)
        // remove old container cable
        engine.removeCable(cid)
        delete nextCables[cid]
        nextFeedback.delete(cid)
      }
    }

    // output proxy: internal source → proxy.in → sp_out_N → external target
    for (let i = 0; i < def.exposedOutputs.length; i++) {
      const exposed = def.exposedOutputs[i]!
      const proxyId = exposed.proxyModuleId
      // find what connects to the proxy's in from inside
      const internalSource = Object.values(def.cables).find(
        (c) => c.to.moduleId === proxyId && c.to.portId === 'in'
      )
      const sourceRootId = internalSource ? idMap.get(internalSource.from.moduleId) : undefined
      if (!sourceRootId || !internalSource) continue
      const portId = `sp_out_${i}`
      for (const [cid, cable] of Object.entries(state.cables)) {
        if (cable.from.moduleId !== instanceId || cable.from.portId !== portId) continue
        const newCable: SerializedCable = {
          id: createCableId(nextCables),
          from: { moduleId: sourceRootId, portId: internalSource.from.portId },
          to: { moduleId: cable.to.moduleId, portId: cable.to.portId },
        }
        const isFeedback = detectsCycle({ ...nextCables, [newCable.id]: newCable }, newCable)
        engine.addCable(newCable, isFeedback)
        nextCables[newCable.id] = newCable
        if (isFeedback) nextFeedback.add(newCable.id)
        engine.removeCable(cid)
        delete nextCables[cid]
        nextFeedback.delete(cid)
      }
    }

    // remove any remaining external cables to/from the container
    for (const [cid, cable] of Object.entries(nextCables)) {
      if (cable.from.moduleId === instanceId || cable.to.moduleId === instanceId) {
        engine.removeCable(cid)
        delete nextCables[cid]
        nextFeedback.delete(cid)
      }
    }

    // collapse worklet modules for the container
    _collapseInstance(instanceId, defId, get())

    // remove the container from store, apply rewired cables
    set((s) => {
      const modules = { ...s.modules }
      delete modules[instanceId]
      return { modules, cables: nextCables, feedbackCableIds: nextFeedback }
    })
    rebuildRootAdjacency(get().modules, get().cables)

    // clean up the definition
    get().deleteDefinition(defId)
  },
})
