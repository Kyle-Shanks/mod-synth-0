import type { StateCreator } from 'zustand'
import type { SerializedCable } from '../engine/types'
import { engine } from '../engine/EngineController'
import { getModule } from '../modules/registry'
import type { StoreState } from './index'

export interface ModuleInstance {
  definitionId: string
  position: { x: number; y: number }
  params: Record<string, number>
}

export interface PatchSlice {
  patchName: string
  modules: Record<string, ModuleInstance>
  cables: Record<string, SerializedCable>
  feedbackCableIds: Set<string>
  setPatchName: (name: string) => void
  addModule: (definitionId: string, position: { x: number; y: number }) => string
  removeModule: (moduleId: string) => void
  addCable: (cable: SerializedCable) => void
  removeCable: (cableId: string) => void
  setParam: (moduleId: string, param: string, value: number) => void
  setModulePosition: (moduleId: string, position: { x: number; y: number }) => void
  loadPatch: (
    name: string,
    modules: Record<string, ModuleInstance>,
    cables: Record<string, SerializedCable>,
  ) => void
  clearPatch: () => void
}

let moduleCounter = 0

// check if a module at `pos` with `width`x`height` overlaps any existing module
function wouldOverlap(
  modules: Record<string, ModuleInstance>,
  pos: { x: number; y: number },
  width: number,
  height: number,
  excludeId?: string,
): boolean {
  for (const [id, m] of Object.entries(modules)) {
    if (id === excludeId) continue
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
  excludeId?: string,
): { x: number; y: number } {
  if (!wouldOverlap(modules, pos, width, height, excludeId)) return pos
  for (let radius = 1; radius <= 20; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue
        const candidate = { x: pos.x + dx, y: pos.y + dy }
        if (!wouldOverlap(modules, candidate, width, height, excludeId)) return candidate
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
    get().pushHistory()
    engine.removeModule(moduleId)
    // also remove any cables connected to this module
    const cables = get().cables
    for (const [cableId, cable] of Object.entries(cables)) {
      if (cable.from.moduleId === moduleId || cable.to.moduleId === moduleId) {
        engine.removeCable(cableId)
      }
    }
    set((s) => {
      const modules = { ...s.modules }
      delete modules[moduleId]
      const remainingCables: Record<string, SerializedCable> = {}
      for (const [cid, c] of Object.entries(s.cables)) {
        if (c.from.moduleId !== moduleId && c.to.moduleId !== moduleId) {
          remainingCables[cid] = c
        }
      }
      return { modules, cables: remainingCables }
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
      delete cables[cableId]
      return { cables }
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

  setModulePosition(moduleId, position) {
    const mod = get().modules[moduleId]
    if (!mod) return
    const def = getModule(mod.definitionId)
    if (!def) return
    // prevent dragging into an overlapping position
    if (wouldOverlap(get().modules, position, def.width, def.height, moduleId)) return
    set((s) => ({
      modules: { ...s.modules, [moduleId]: { ...s.modules[moduleId]!, position } }
    }))
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
