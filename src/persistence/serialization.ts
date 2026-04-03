import type { SerializedCable } from '../engine/types'
import type { ModuleInstance } from '../store/patchSlice'
import type { StoreState } from '../store'

export interface SerializedPatch {
  version: string
  name: string
  createdAt: string
  updatedAt: string

  modules: {
    id: string
    definitionId: string
    position: { x: number; y: number }
    params: Record<string, number>
  }[]

  cables: {
    id: string
    from: { moduleId: string; portId: string }
    to: { moduleId: string; portId: string }
  }[]

  settings: {
    cableTautness: number
    tooltipsEnabled: boolean
    themeId: string
  }
}

const PATCH_VERSION = '1'

export function serializePatch(state: StoreState): SerializedPatch {
  const now = new Date().toISOString()

  return {
    version: PATCH_VERSION,
    name: state.patchName,
    createdAt: now,
    updatedAt: now,

    modules: Object.entries(state.modules).map(([id, mod]) => ({
      id,
      definitionId: mod.definitionId,
      position: mod.position,
      params: { ...mod.params },
    })),

    cables: Object.values(state.cables).map((cable) => ({
      id: cable.id,
      from: { ...cable.from },
      to: { ...cable.to },
    })),

    settings: {
      cableTautness: state.cableTautness,
      tooltipsEnabled: state.tooltipsEnabled,
      themeId: state.themeId,
    },
  }
}

export function deserializePatch(json: SerializedPatch): {
  name: string
  modules: Record<string, ModuleInstance>
  cables: Record<string, SerializedCable>
  settings: {
    cableTautness: number
    tooltipsEnabled: boolean
    themeId: string
  }
} {
  const modules: Record<string, ModuleInstance> = {}
  for (const m of json.modules) {
    modules[m.id] = {
      definitionId: m.definitionId,
      position: m.position,
      params: m.params,
    }
  }

  const cables: Record<string, SerializedCable> = {}
  for (const c of json.cables) {
    cables[c.id] = {
      id: c.id,
      from: c.from,
      to: c.to,
    }
  }

  return {
    name: json.name,
    modules,
    cables,
    settings: json.settings,
  }
}

export function validatePatchJson(data: unknown): data is SerializedPatch {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>
  if (typeof obj.version !== 'string') return false
  if (typeof obj.name !== 'string') return false
  if (!Array.isArray(obj.modules)) return false
  if (!Array.isArray(obj.cables)) return false
  if (typeof obj.settings !== 'object' || obj.settings === null) return false
  return true
}
