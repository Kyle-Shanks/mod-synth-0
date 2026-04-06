import type { StateCreator } from 'zustand'
import type { SerializedCable } from '../engine/types'
import { engine } from '../engine/EngineController'
import { getModule } from '../modules/registry'
import type { StoreState } from './index'

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
  ) => void
  clearPatch: () => void
}

let moduleCounter = 0

function createCableId(cables: Record<string, SerializedCable>): string {
  let id = ''
  do {
    id = `cable-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  } while (cables[id])
  return id
}

// check if a module at `pos` with `width`x`height` overlaps any existing module
function wouldOverlap(
  modules: Record<string, ModuleInstance>,
  pos: { x: number; y: number },
  width: number,
  height: number,
  excludeIds?: Set<string>,
): boolean {
  for (const [id, m] of Object.entries(modules)) {
    if (excludeIds?.has(id)) continue
    const mDef = getModule(m.definitionId)
    if (!mDef) continue
    const noOverlap =
      pos.x + width <= m.position.x ||
      m.position.x + mDef.width <= pos.x ||
      pos.y + height <= m.position.y ||
      m.position.y + mDef.height <= pos.y
    if (!noOverlap) return true
  }
  return false
}

// find the nearest non-overlapping position by scanning outward
function findFreePosition(
  modules: Record<string, ModuleInstance>,
  pos: { x: number; y: number },
  width: number,
  height: number,
  excludeIds?: Set<string>,
): { x: number; y: number } {
  if (!wouldOverlap(modules, pos, width, height, excludeIds)) return pos
  for (let radius = 1; radius <= 20; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue
        const candidate = { x: pos.x + dx, y: pos.y + dy }
        if (!wouldOverlap(modules, candidate, width, height, excludeIds)) return candidate
      }
    }
  }
  return pos // give up after 20 grid units
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

export const createPatchSlice: StateCreator<StoreState, [], [], PatchSlice> = (set, get) => ({
  patchName: 'untitled patch',
  modules: {},
  cables: {},
  feedbackCableIds: new Set<string>(),

  setPatchName(name) {
    set({ patchName: name })
  },

  addModule(definitionId, position) {
    get().pushHistory()
    const def = getModule(definitionId)
    if (!def) return ''

    const id = `${definitionId}-${++moduleCounter}`
    const params: Record<string, number> = {}
    for (const [key, param] of Object.entries(def.params)) {
      params[key] = param.default
    }
    const state = def.initialize({ sampleRate: engine.sampleRate, bufferSize: 128 })

    const freePos = findFreePosition(get().modules, position, def.width, def.height)

    engine.addModule({ id, definitionId, params, state, position: freePos }, def)

    set((s) => ({
      modules: { ...s.modules, [id]: { definitionId, position: freePos, params } }
    }))
    return id
  },

  removeModule(moduleId) {
    get().removeModules([moduleId])
  },

  removeModules(moduleIds) {
    const existingIds = [...new Set(moduleIds)].filter((id) => !!get().modules[id])
    if (existingIds.length === 0) return

    get().pushHistory()
    const removeSet = new Set(existingIds)

    for (const moduleId of existingIds) {
      engine.removeModule(moduleId)
    }

    // remove any cables connected to removed modules
    for (const [cableId, cable] of Object.entries(get().cables)) {
      if (removeSet.has(cable.from.moduleId) || removeSet.has(cable.to.moduleId)) {
        engine.removeCable(cableId)
      }
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
    get().pushHistory()
    // detect if this cable creates a cycle
    const allCables = { ...get().cables, [cable.id]: cable }
    const isFeedback = detectsCycle(allCables, cable)
    engine.addCable(cable, isFeedback)
    set((s) => {
      const newFeedback = new Set(s.feedbackCableIds)
      if (isFeedback) newFeedback.add(cable.id)
      return { cables: { ...s.cables, [cable.id]: cable }, feedbackCableIds: newFeedback }
    })
  },

  removeCable(cableId) {
    get().pushHistory()
    engine.removeCable(cableId)
    set((s) => {
      const cables = { ...s.cables }
      const feedbackCableIds = new Set(s.feedbackCableIds)
      delete cables[cableId]
      feedbackCableIds.delete(cableId)
      return { cables, feedbackCableIds }
    })
  },

  setParam(moduleId, param, value) {
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

    let minClipboardX = 0
    let minClipboardY = 0
    if (targetPosition) {
      minClipboardX = Math.min(...pasteableItems.map((item) => item.position.x))
      minClipboardY = Math.min(...pasteableItems.map((item) => item.position.y))
    }

    const nextModules: Record<string, ModuleInstance> = { ...get().modules }
    const nextCables: Record<string, SerializedCable> = { ...get().cables }
    const nextFeedback = new Set(get().feedbackCableIds)
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

      const isFeedback = detectsCycle(
        { ...nextCables, [pastedCable.id]: pastedCable },
        pastedCable,
      )
      engine.addCable(pastedCable, isFeedback)
      nextCables[pastedCable.id] = pastedCable
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

    return pastedModuleIds
  },

  setModulePosition(moduleId, position) {
    const mod = get().modules[moduleId]
    if (!mod) return
    const def = getModule(mod.definitionId)
    if (!def) return
    // prevent dragging into an overlapping position
    if (wouldOverlap(get().modules, position, def.width, def.height, new Set([moduleId]))) return
    set((s) => ({
      modules: { ...s.modules, [moduleId]: { ...s.modules[moduleId]!, position } }
    }))
  },

  setModulesPositions(positions) {
    const modules = get().modules
    const movingIds = Object.keys(positions).filter((id) => !!modules[id])
    if (movingIds.length === 0) return

    const movingSet = new Set(movingIds)
    for (const moduleId of movingIds) {
      const mod = modules[moduleId]
      if (!mod) continue
      const def = getModule(mod.definitionId)
      if (!def) continue
      const position = positions[moduleId]
      if (!position) continue
      if (wouldOverlap(modules, position, def.width, def.height, movingSet)) return
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

  loadPatch(name, modules, cables) {
    // tear down existing engine state
    const oldCables = get().cables
    const oldModules = get().modules
    for (const cableId of Object.keys(oldCables)) {
      engine.removeCable(cableId)
    }
    for (const moduleId of Object.keys(oldModules)) {
      engine.removeModule(moduleId)
    }
    get().clearHistory()

    // add new modules to the engine
    // update moduleCounter to avoid id collisions with restored modules
    for (const [id, mod] of Object.entries(modules)) {
      const match = id.match(/-(\d+)$/)
      if (match) {
        const num = parseInt(match[1]!, 10)
        if (num >= moduleCounter) moduleCounter = num
      }
      const def = getModule(mod.definitionId)
      if (!def) continue // missing module — kept in store but not added to engine
      const state = def.initialize({ sampleRate: engine.sampleRate, bufferSize: 128 })
      engine.addModule({ id, definitionId: mod.definitionId, params: mod.params, state, position: mod.position }, def)
    }

    // detect feedback cables and add to engine
    const feedbackIds = new Set<string>()
    const cablesSoFar: Record<string, SerializedCable> = {}
    for (const [cableId, cable] of Object.entries(cables)) {
      const isFeedback = detectsCycle({ ...cablesSoFar, [cableId]: cable }, cable)
      if (isFeedback) feedbackIds.add(cableId)
      // only add cable if both modules exist in the engine (have valid definitions)
      const fromMod = modules[cable.from.moduleId]
      const toMod = modules[cable.to.moduleId]
      if (fromMod && toMod && getModule(fromMod.definitionId) && getModule(toMod.definitionId)) {
        engine.addCable(cable, isFeedback)
      }
      cablesSoFar[cableId] = cable
    }

    set({
      patchName: name,
      modules,
      cables,
      feedbackCableIds: feedbackIds,
    })
    get().bumpEngineRevision()
  },

  clearPatch() {
    const oldCables = get().cables
    const oldModules = get().modules
    for (const cableId of Object.keys(oldCables)) {
      engine.removeCable(cableId)
    }
    for (const moduleId of Object.keys(oldModules)) {
      engine.removeModule(moduleId)
    }
    get().clearHistory()
    moduleCounter = 0
    set({
      patchName: 'untitled patch',
      modules: {},
      cables: {},
      feedbackCableIds: new Set<string>(),
    })
  },
})
