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
  modules: Record<string, ModuleInstance>
  cables: Record<string, SerializedCable>
  addModule: (definitionId: string, position: { x: number; y: number }) => string
  removeModule: (moduleId: string) => void
  addCable: (cable: SerializedCable) => void
  removeCable: (cableId: string) => void
  setParam: (moduleId: string, param: string, value: number) => void
  setModulePosition: (moduleId: string, position: { x: number; y: number }) => void
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

export const createPatchSlice: StateCreator<StoreState, [], [], PatchSlice> = (set, get) => ({
  modules: {},
  cables: {},

  addModule(definitionId, position) {
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
    engine.addCable(cable)
    set((s) => ({ cables: { ...s.cables, [cable.id]: cable } }))
  },

  removeCable(cableId) {
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
})
