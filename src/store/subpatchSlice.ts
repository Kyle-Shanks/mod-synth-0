import type { StateCreator } from 'zustand'
import type { SerializedCable, SubpatchDefinition, ExposedPortDef, MacroDefinition } from '../engine/types'
import type { StoreState } from './index'
import type { ModuleInstance } from './patchSlice'
import { findFreePosition } from './patchSlice'
import { engine } from '../engine/EngineController'
import { getModule } from '../modules/registry'

const LIBRARY_KEY = 'modsynth0:subpatch-library'

export function loadLibraryFromStorage(): Record<string, SubpatchDefinition> {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, SubpatchDefinition>
  } catch {
    return {}
  }
}

function persistLibrary(presets: Record<string, SubpatchDefinition>): void {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(presets))
  } catch {
    console.warn('failed to save subpatch library')
  }
}

// ── SubpatchContainerInstance ─────────────────────────────────────────────────
// A module instance in the root patch that represents a subpatch container.
// Extends ModuleInstance with subpatch-specific fields.
// definitionId is always '__subpatch__'.
export interface SubpatchContainerInstance extends ModuleInstance {
  definitionId: '__subpatch__'
  subpatchDefinitionId: string
  macroValues: Record<string, number>  // macroId → per-instance value
  // pre-computed display dimensions (in grid units), recomputed when definition changes
  containerWidth: number
  containerHeight: number
}

export function isSubpatchContainer(mod: ModuleInstance): mod is SubpatchContainerInstance {
  return mod.definitionId === '__subpatch__'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Port IDs used on the container face in the parent patch
export function subpatchInputPortId(index: number): string {
  return `sp_in_${index}`
}
export function subpatchOutputPortId(index: number): string {
  return `sp_out_${index}`
}
export function parseSubpatchPortId(portId: string): { isSubpatchPort: true; direction: 'input' | 'output'; index: number } | { isSubpatchPort: false } {
  const m = portId.match(/^sp_(in|out)_(\d+)$/)
  if (!m) return { isSubpatchPort: false }
  return { isSubpatchPort: true, direction: m[1] === 'in' ? 'input' : 'output', index: parseInt(m[2]!) }
}

// Worklet module ID for an internal module within a specific instance
export function internalWorkletId(instanceId: string, internalModId: string): string {
  return `${instanceId}::${internalModId}`
}

// Translate a container port reference to its worklet module+port equivalent
export function resolveContainerPort(
  moduleId: string,
  portId: string,
  def: SubpatchDefinition,
): { moduleId: string; portId: string } {
  const parsed = parseSubpatchPortId(portId)
  if (!parsed.isSubpatchPort) return { moduleId, portId }
  const ports = parsed.direction === 'input' ? def.exposedInputs : def.exposedOutputs
  const exposed = ports[parsed.index]
  if (!exposed) return { moduleId, portId }
  const workletModId = internalWorkletId(moduleId, exposed.proxyModuleId)
  // input proxy exposes 'in' as the target; output proxy exposes 'out' as the source
  const workletPortId = parsed.direction === 'input' ? 'in' : 'out'
  return { moduleId: workletModId, portId: workletPortId }
}

// Compute display dimensions for a container based on its definition
export function computeContainerSize(def: SubpatchDefinition): { width: number; height: number } {
  if (def.widthOverride != null && def.heightOverride != null) {
    return { width: def.widthOverride, height: def.heightOverride }
  }
  const portCount = Math.max(def.exposedInputs.length, def.exposedOutputs.length, 1)
  const macroCount = def.macros.length
  // min width 4, +1 for each macro beyond 2 pairs
  const autoWidth = Math.max(4, Math.ceil((macroCount + 1) / 2) * 2)
  // header (1) + macros area (1 per 2 macros, min 1) + ports row (1) = min 3
  const macroRows = macroCount === 0 ? 0 : Math.ceil(macroCount / 2)
  const autoHeight = Math.max(3, 1 + macroRows + Math.ceil(portCount / 3))
  return {
    width: def.widthOverride ?? autoWidth,
    height: def.heightOverride ?? autoHeight,
  }
}

let subpatchCounter = 0

function newSubpatchId(): string {
  return `sp-${++subpatchCounter}-${Math.random().toString(36).slice(2, 5)}`
}

// ── Slice ─────────────────────────────────────────────────────────────────────

export interface SubpatchSlice {
  // Definitions keyed by their id — stored per-patch (saved with patch)
  definitions: Record<string, SubpatchDefinition>
  // Global library presets (persisted to localStorage separately)
  libraryPresets: Record<string, SubpatchDefinition>

  createDefinition: (name: string) => string
  updateDefinitionName: (defId: string, name: string) => void
  updateDefinitionSize: (defId: string, width: number | undefined, height: number | undefined) => void
  deleteDefinition: (defId: string) => void

  // Internal patch editing (called while drilled into a subpatch)
  addModuleToDefinition: (defId: string, definitionId: string, position: { x: number; y: number }) => string
  removeModuleFromDefinition: (defId: string, moduleId: string) => void
  addCableToDefinition: (defId: string, cable: SerializedCable) => void
  removeCableFromDefinition: (defId: string, cableId: string) => void
  setParamInDefinition: (defId: string, moduleId: string, param: string, value: number) => void
  setModuleDataInDefinition: (defId: string, moduleId: string, key: string, value: string) => void
  setModulePositionInDefinition: (defId: string, moduleId: string, position: { x: number; y: number }) => void

  // Port and macro exposure
  refreshExposedPorts: (defId: string) => void
  addMacro: (defId: string, macro: MacroDefinition) => void
  removeMacro: (defId: string, macroId: string) => void
  setMacroValue: (instanceId: string, macroId: string, value: number) => void

  // Instance sync — called after exiting a subpatch to update all other instances
  syncAllInstances: (defId: string) => void

  // Library
  saveDefinitionToLibrary: (defId: string) => void
  instantiateFromLibrary: (presetId: string, position: { x: number; y: number }) => string
  deleteLibraryPreset: (presetId: string) => void
  renameLibraryPreset: (presetId: string, name: string) => void
}

export const createSubpatchSlice: StateCreator<StoreState, [], [], SubpatchSlice> = (set, get) => ({
  definitions: {},
  libraryPresets: {},

  createDefinition(name) {
    const id = newSubpatchId()
    const def: SubpatchDefinition = {
      id,
      name,
      modules: {},
      cables: {},
      exposedInputs: [],
      exposedOutputs: [],
      macros: [],
    }
    set((s) => ({ definitions: { ...s.definitions, [id]: def } }))
    return id
  },

  updateDefinitionName(defId, name) {
    set((s) => {
      const def = s.definitions[defId]
      if (!def) return s
      // update definition + any matching subpatchContext entries in one set call
      const newContext = s.subpatchContext.map((entry) =>
        entry.definitionId === defId ? { ...entry, name } : entry,
      )
      return {
        definitions: { ...s.definitions, [defId]: { ...def, name } },
        subpatchContext: newContext,
      }
    })
  },

  updateDefinitionSize(defId, width, height) {
    set((s) => {
      const def = s.definitions[defId]
      if (!def) return s
      const updated: SubpatchDefinition = { ...def, widthOverride: width, heightOverride: height }
      const { width: w, height: h } = computeContainerSize(updated)
      // also update containerWidth/containerHeight on all container instances
      const updatedModules = { ...s.modules }
      let changed = false
      for (const [id, mod] of Object.entries(s.modules)) {
        if (!isSubpatchContainer(mod) || mod.subpatchDefinitionId !== defId) continue
        updatedModules[id] = { ...mod, containerWidth: w, containerHeight: h } as SubpatchContainerInstance
        changed = true
      }
      return {
        definitions: { ...s.definitions, [defId]: updated },
        ...(changed ? { modules: updatedModules } : {}),
      }
    })
  },

  deleteDefinition(defId) {
    set((s) => {
      const defs = { ...s.definitions }
      delete defs[defId]
      return { definitions: defs }
    })
  },

  addModuleToDefinition(defId, definitionId, position) {
    const moduleDef = getModule(definitionId)
    if (!moduleDef) return ''
    const state = moduleDef.initialize({ sampleRate: engine.sampleRate, bufferSize: 128 })
    const params: Record<string, number> = {}
    for (const [k, p] of Object.entries(moduleDef.params)) params[k] = p.default

    const id = `${definitionId}-${++subpatchCounter}`

    // resolve a non-overlapping position within the definition's module map
    const defModules = (get().definitions[defId]?.modules ?? {}) as Record<string, ModuleInstance>
    const freePos = findFreePosition(defModules, position, moduleDef.width, moduleDef.height)

    // add to worklet for all instances of this definition
    for (const [instanceId, mod] of Object.entries(get().modules)) {
      if (!isSubpatchContainer(mod) || mod.subpatchDefinitionId !== defId) continue
      engine.addModule({ id: internalWorkletId(instanceId, id), definitionId, params, state, position: freePos }, moduleDef)
    }

    const newMod: ModuleInstance = { definitionId, position: freePos, params }
    if (definitionId === 'subpatch-input' || definitionId === 'subpatch-output') {
      // proxy modules get a default label from their definition name and default port type
      newMod.data = { label: definitionId === 'subpatch-input' ? 'in' : 'out', portType: 'audio' }
    }

    set((s) => {
      const def = s.definitions[defId]
      if (!def) return s
      const updated: SubpatchDefinition = {
        ...def,
        modules: { ...def.modules, [id]: newMod },
      }
      return { definitions: { ...s.definitions, [defId]: updated } }
    })

    // refresh exposed ports if a proxy was added
    if (definitionId === 'subpatch-input' || definitionId === 'subpatch-output') {
      get().refreshExposedPorts(defId)
    }

    return id
  },

  removeModuleFromDefinition(defId, moduleId) {
    // remove from worklet for all instances
    for (const [instanceId, mod] of Object.entries(get().modules)) {
      if (!isSubpatchContainer(mod) || mod.subpatchDefinitionId !== defId) continue
      engine.removeModule(internalWorkletId(instanceId, moduleId))
    }

    set((s) => {
      const def = s.definitions[defId]
      if (!def) return s
      const modules = { ...def.modules }
      const cables = { ...def.cables }
      delete modules[moduleId]
      // remove cables connected to this module
      for (const [cid, cable] of Object.entries(def.cables)) {
        if (cable.from.moduleId === moduleId || cable.to.moduleId === moduleId) {
          delete cables[cid]
          // also remove from worklet for all instances
          for (const [instanceId, m] of Object.entries(get().modules)) {
            if (!isSubpatchContainer(m) || m.subpatchDefinitionId !== defId) continue
            engine.removeCable(internalWorkletId(instanceId, cid))
          }
        }
      }
      const updated: SubpatchDefinition = { ...def, modules, cables }
      return { definitions: { ...s.definitions, [defId]: updated } }
    })

    get().refreshExposedPorts(defId)
  },

  addCableToDefinition(defId, cable) {
    // add to worklet for all instances with remapped IDs
    for (const [instanceId, mod] of Object.entries(get().modules)) {
      if (!isSubpatchContainer(mod) || mod.subpatchDefinitionId !== defId) continue
      const workletCable: SerializedCable = {
        id: internalWorkletId(instanceId, cable.id),
        from: { moduleId: internalWorkletId(instanceId, cable.from.moduleId), portId: cable.from.portId },
        to: { moduleId: internalWorkletId(instanceId, cable.to.moduleId), portId: cable.to.portId },
      }
      engine.addCable(workletCable, false)
    }

    set((s) => {
      const def = s.definitions[defId]
      if (!def) return s
      return {
        definitions: {
          ...s.definitions,
          [defId]: { ...def, cables: { ...def.cables, [cable.id]: cable } },
        },
      }
    })
  },

  removeCableFromDefinition(defId, cableId) {
    for (const [instanceId, mod] of Object.entries(get().modules)) {
      if (!isSubpatchContainer(mod) || mod.subpatchDefinitionId !== defId) continue
      engine.removeCable(internalWorkletId(instanceId, cableId))
    }

    set((s) => {
      const def = s.definitions[defId]
      if (!def) return s
      const cables = { ...def.cables }
      delete cables[cableId]
      return { definitions: { ...s.definitions, [defId]: { ...def, cables } } }
    })
  },

  setParamInDefinition(defId, moduleId, param, value) {
    for (const [instanceId, mod] of Object.entries(get().modules)) {
      if (!isSubpatchContainer(mod) || mod.subpatchDefinitionId !== defId) continue
      engine.setParam(internalWorkletId(instanceId, moduleId), param, value)
    }

    set((s) => {
      const def = s.definitions[defId]
      if (!def) return s
      const internalMod = def.modules[moduleId]
      if (!internalMod) return s
      return {
        definitions: {
          ...s.definitions,
          [defId]: {
            ...def,
            modules: {
              ...def.modules,
              [moduleId]: { ...internalMod, params: { ...internalMod.params, [param]: value } },
            },
          },
        },
      }
    })
  },

  setModuleDataInDefinition(defId, moduleId, key, value) {
    set((s) => {
      const def = s.definitions[defId]
      if (!def) return s
      const internalMod = def.modules[moduleId]
      if (!internalMod) return s
      return {
        definitions: {
          ...s.definitions,
          [defId]: {
            ...def,
            modules: {
              ...def.modules,
              [moduleId]: {
                ...internalMod,
                data: { ...(internalMod.data ?? {}), [key]: value },
              },
            },
          },
        },
      }
    })
    // if portType or label changed on a proxy, refresh exposed ports
    if (key === 'portType' || key === 'label') {
      get().refreshExposedPorts(defId)
    }
  },

  setModulePositionInDefinition(defId, moduleId, position) {
    set((s) => {
      const def = s.definitions[defId]
      if (!def) return s
      const internalMod = def.modules[moduleId]
      if (!internalMod) return s
      return {
        definitions: {
          ...s.definitions,
          [defId]: {
            ...def,
            modules: { ...def.modules, [moduleId]: { ...internalMod, position } },
          },
        },
      }
    })
  },

  refreshExposedPorts(defId) {
    set((s) => {
      const def = s.definitions[defId]
      if (!def) return s

      const exposedInputs: ExposedPortDef[] = []
      const exposedOutputs: ExposedPortDef[] = []

      for (const [modId, mod] of Object.entries(def.modules)) {
        if (mod.definitionId === 'subpatch-input') {
          exposedInputs.push({
            proxyModuleId: modId,
            label: mod.data?.['label'] ?? 'in',
            type: (mod.data?.['portType'] as ExposedPortDef['type']) ?? 'audio',
          })
        } else if (mod.definitionId === 'subpatch-output') {
          exposedOutputs.push({
            proxyModuleId: modId,
            label: mod.data?.['label'] ?? 'out',
            type: (mod.data?.['portType'] as ExposedPortDef['type']) ?? 'audio',
          })
        }
      }

      // stable ordering: sort by proxy module ID to prevent jumpy reordering
      exposedInputs.sort((a, b) => a.proxyModuleId.localeCompare(b.proxyModuleId))
      exposedOutputs.sort((a, b) => a.proxyModuleId.localeCompare(b.proxyModuleId))

      const { width, height } = computeContainerSize({ ...def, exposedInputs, exposedOutputs })

      // update all container instances' dimensions
      const updatedModules = { ...s.modules }
      let modulesChanged = false
      for (const [instanceId, mod] of Object.entries(s.modules)) {
        if (!isSubpatchContainer(mod) || mod.subpatchDefinitionId !== defId) continue
        updatedModules[instanceId] = {
          ...mod,
          containerWidth: width,
          containerHeight: height,
        } as SubpatchContainerInstance
        modulesChanged = true
      }

      return {
        definitions: {
          ...s.definitions,
          [defId]: { ...def, exposedInputs, exposedOutputs },
        },
        ...(modulesChanged ? { modules: updatedModules } : {}),
      }
    })
  },

  addMacro(defId, macro) {
    set((s) => {
      const def = s.definitions[defId]
      if (!def) return s
      const macros = [...def.macros.filter((m) => m.id !== macro.id), macro]
      const updated = { ...def, macros }
      const { width, height } = computeContainerSize(updated)
      const updatedModules = { ...s.modules }
      for (const [id, mod] of Object.entries(s.modules)) {
        if (!isSubpatchContainer(mod) || mod.subpatchDefinitionId !== defId) continue
        updatedModules[id] = { ...mod, containerWidth: width, containerHeight: height } as SubpatchContainerInstance
      }
      return {
        definitions: { ...s.definitions, [defId]: updated },
        modules: updatedModules,
      }
    })
  },

  removeMacro(defId, macroId) {
    set((s) => {
      const def = s.definitions[defId]
      if (!def) return s
      const macros = def.macros.filter((m) => m.id !== macroId)
      const updated = { ...def, macros }
      const { width, height } = computeContainerSize(updated)
      const updatedModules = { ...s.modules }
      for (const [id, mod] of Object.entries(s.modules)) {
        if (!isSubpatchContainer(mod) || mod.subpatchDefinitionId !== defId) continue
        updatedModules[id] = { ...mod, containerWidth: width, containerHeight: height } as SubpatchContainerInstance
      }
      return {
        definitions: { ...s.definitions, [defId]: updated },
        modules: updatedModules,
      }
    })
  },

  setMacroValue(instanceId, macroId, value) {
    const state = get()
    const container = state.modules[instanceId]
    if (!container || !isSubpatchContainer(container)) return
    const def = state.definitions[container.subpatchDefinitionId]
    if (!def) return
    const macro = def.macros.find((m) => m.id === macroId)
    if (!macro) return

    // route to the internal worklet module
    engine.setParam(internalWorkletId(instanceId, macro.targetModuleId), macro.targetParamId, value)

    set((s) => {
      const mod = s.modules[instanceId]
      if (!mod || !isSubpatchContainer(mod)) return s
      return {
        modules: {
          ...s.modules,
          [instanceId]: {
            ...mod,
            macroValues: { ...mod.macroValues, [macroId]: value },
          } as SubpatchContainerInstance,
        },
      }
    })
  },

  syncAllInstances(defId) {
    const state = get()
    const def = state.definitions[defId]
    if (!def) return

    for (const [instanceId, mod] of Object.entries(state.modules)) {
      if (!isSubpatchContainer(mod) || mod.subpatchDefinitionId !== defId) continue
      // collapse and re-expand
      _collapseInstance(instanceId, defId, state)
      _expandInstance(instanceId, mod as SubpatchContainerInstance, def, state)
    }
  },

  saveDefinitionToLibrary(defId) {
    const def = get().definitions[defId]
    if (!def) return
    set((s) => {
      // remove any existing preset with the same name (overwrite semantics)
      const presets: Record<string, SubpatchDefinition> = {}
      for (const [id, p] of Object.entries(s.libraryPresets)) {
        if (p.name !== def.name) presets[id] = p
      }
      presets[def.id] = structuredClone(def)
      return { libraryPresets: presets }
    })
    persistLibrary(get().libraryPresets)
  },

  instantiateFromLibrary(presetId, position) {
    const preset = get().libraryPresets[presetId]
    if (!preset) return ''
    // clone the definition with a fresh ID so it's independent
    const newId = newSubpatchId()
    const cloned: SubpatchDefinition = { ...structuredClone(preset), id: newId }
    set((s) => ({ definitions: { ...s.definitions, [newId]: cloned } }))
    return get().addSubpatchContainer(newId, position)
  },

  deleteLibraryPreset(presetId) {
    set((s) => {
      const p = { ...s.libraryPresets }
      delete p[presetId]
      return { libraryPresets: p }
    })
    persistLibrary(get().libraryPresets)
  },

  renameLibraryPreset(presetId, name) {
    set((s) => {
      const preset = s.libraryPresets[presetId]
      if (!preset) return s
      return {
        libraryPresets: { ...s.libraryPresets, [presetId]: { ...preset, name } },
      }
    })
    persistLibrary(get().libraryPresets)
  },
})

// ── Internal helpers (not exported as actions) ────────────────────────────────

export function _expandInstance(
  instanceId: string,
  container: SubpatchContainerInstance,
  def: SubpatchDefinition,
  state: StoreState,
): void {
  for (const [internalModId, internalMod] of Object.entries(def.modules)) {
    const moduleDef = getModule(internalMod.definitionId)
    if (!moduleDef) continue
    const workletState = moduleDef.initialize({ sampleRate: engine.sampleRate, bufferSize: 128 })
    engine.addModule(
      {
        id: internalWorkletId(instanceId, internalModId),
        definitionId: internalMod.definitionId,
        params: { ...internalMod.params },
        state: workletState,
        position: internalMod.position,
      },
      moduleDef,
    )
  }
  // apply macro values
  for (const macro of def.macros) {
    const value = container.macroValues[macro.id] ?? (() => {
      const targetMod = def.modules[macro.targetModuleId]
      const targetDef = targetMod ? getModule(targetMod.definitionId) : undefined
      return targetDef?.params[macro.targetParamId]?.default ?? 0
    })()
    engine.setParam(internalWorkletId(instanceId, macro.targetModuleId), macro.targetParamId, value)
  }
  // add internal cables
  for (const [cableId, cable] of Object.entries(def.cables)) {
    const workletCable: SerializedCable = {
      id: internalWorkletId(instanceId, cableId),
      from: { moduleId: internalWorkletId(instanceId, cable.from.moduleId), portId: cable.from.portId },
      to: { moduleId: internalWorkletId(instanceId, cable.to.moduleId), portId: cable.to.portId },
    }
    engine.addCable(workletCable, false)
  }
  // reconnect any external cables in the root patch that reference this container
  for (const cable of Object.values(state.cables)) {
    const fromIsContainer = cable.from.moduleId === instanceId
    const toIsContainer = cable.to.moduleId === instanceId
    if (!fromIsContainer && !toIsContainer) continue
    const from = fromIsContainer
      ? resolveContainerPort(cable.from.moduleId, cable.from.portId, def)
      : cable.from
    const to = toIsContainer
      ? resolveContainerPort(cable.to.moduleId, cable.to.portId, def)
      : cable.to
    engine.addCable({ id: cable.id, from, to }, false)
  }
}

export function _collapseInstance(
  instanceId: string,
  defId: string,
  state: StoreState,
): void {
  const def = state.definitions[defId]
  if (!def) return
  // first remove external cables that route through this container
  for (const cable of Object.values(state.cables)) {
    if (cable.from.moduleId === instanceId || cable.to.moduleId === instanceId) {
      engine.removeCable(cable.id)
    }
  }
  // remove internal cables from worklet
  for (const cableId of Object.keys(def.cables)) {
    engine.removeCable(internalWorkletId(instanceId, cableId))
  }
  // remove internal modules from worklet
  for (const internalModId of Object.keys(def.modules)) {
    engine.removeModule(internalWorkletId(instanceId, internalModId))
  }
}
