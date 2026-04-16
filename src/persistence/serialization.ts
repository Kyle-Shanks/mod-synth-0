import type { SerializedCable, SubpatchDefinition } from '../engine/types'
import type { ModuleInstance } from '../store/patchSlice'
import type { SubpatchContainerInstance } from '../store/subpatchSlice'
import { isSubpatchContainer } from '../store/subpatchSlice'
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
    data?: Record<string, string>
    // container-specific fields
    subpatchDefinitionId?: string
    macroValues?: Record<string, number>
    containerWidth?: number
    containerHeight?: number
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

  // subpatch definitions (patch-local; separate from global library)
  subpatchDefinitions?: SubpatchDefinition[]
}

const PATCH_VERSION = '1'

type ModuleRecordLike = Record<string, { definitionId: string }>

function remapLegacyVcaGainPort(
  endpoint: { moduleId: string; portId: string },
  modules: ModuleRecordLike,
): { moduleId: string; portId: string } {
  const module = modules[endpoint.moduleId]
  if (module?.definitionId === 'vca' && endpoint.portId === 'cv') {
    return { moduleId: endpoint.moduleId, portId: 'gain' }
  }
  return endpoint
}

export function serializePatch(state: StoreState): SerializedPatch {
  const now = new Date().toISOString()

  return {
    version: PATCH_VERSION,
    name: state.patchName,
    createdAt: now,
    updatedAt: now,

    // Build sets of all internal module/cable IDs so we can exclude them if
    // serializePatch is called while the user is drilled into a subpatch.
    // During drill-in, those IDs are injected into state.modules/cables but
    // must NOT be persisted — they belong to the definition, not the root patch.
    ...(() => {
      const internalModuleIds = new Set<string>()
      const internalCableIds = new Set<string>()
      for (const def of Object.values(state.definitions)) {
        for (const id of Object.keys(def.modules)) internalModuleIds.add(id)
        for (const id of Object.keys(def.cables)) internalCableIds.add(id)
      }

      const modules = Object.entries(state.modules)
        .filter(([id]) => !internalModuleIds.has(id))
        .map(([id, mod]) => {
          if (isSubpatchContainer(mod)) {
            const container = mod as SubpatchContainerInstance
            return {
              id,
              definitionId: '__subpatch__',
              position: mod.position,
              params: {},
              subpatchDefinitionId: container.subpatchDefinitionId,
              macroValues: { ...container.macroValues },
              containerWidth: container.containerWidth,
              containerHeight: container.containerHeight,
            }
          }
          return {
            id,
            definitionId: mod.definitionId,
            position: mod.position,
            params: { ...mod.params },
            data: mod.data ? { ...mod.data } : undefined,
          }
        })

      const cables = Object.values(state.cables)
        .filter((c) => !internalCableIds.has(c.id))
        .map((cable) => ({
          id: cable.id,
          from: { ...cable.from },
          to: { ...cable.to },
        }))

      return { modules, cables }
    })(),

    settings: {
      cableTautness: state.cableTautness,
      tooltipsEnabled: state.tooltipsEnabled,
      themeId: state.themeId,
    },

    subpatchDefinitions: Object.values(state.definitions),
  }
}

export function deserializePatch(json: SerializedPatch): {
  name: string
  modules: Record<string, ModuleInstance>
  cables: Record<string, SerializedCable>
  definitions: Record<string, SubpatchDefinition>
  settings: {
    cableTautness: number
    tooltipsEnabled: boolean
    themeId: string
  }
} {
  const modules: Record<string, ModuleInstance> = {}
  for (const m of json.modules) {
    if (m.definitionId === '__subpatch__' && m.subpatchDefinitionId) {
      const container: SubpatchContainerInstance = {
        definitionId: '__subpatch__',
        position: m.position,
        params: {},
        subpatchDefinitionId: m.subpatchDefinitionId,
        macroValues: m.macroValues ?? {},
        containerWidth: m.containerWidth ?? 4,
        containerHeight: m.containerHeight ?? 3,
      }
      modules[m.id] = container
    } else {
      modules[m.id] = {
        definitionId: m.definitionId,
        position: m.position,
        params: m.params,
        data:
          m.data && typeof m.data === 'object'
            ? ({ ...(m.data as Record<string, string>) })
            : undefined,
      }
    }
  }

  const cables: Record<string, SerializedCable> = {}
  for (const c of json.cables) {
    cables[c.id] = {
      id: c.id,
      from: remapLegacyVcaGainPort(c.from, modules),
      to: remapLegacyVcaGainPort(c.to, modules),
    }
  }

  const definitions: Record<string, SubpatchDefinition> = {}
  if (json.subpatchDefinitions) {
    for (const def of json.subpatchDefinitions) {
      const migratedCables: Record<string, SerializedCable> = {}
      for (const [cableId, cable] of Object.entries(def.cables)) {
        migratedCables[cableId] = {
          ...cable,
          from: remapLegacyVcaGainPort(cable.from, def.modules),
          to: remapLegacyVcaGainPort(cable.to, def.modules),
        }
      }
      definitions[def.id] = { ...def, cables: migratedCables }
    }
  }

  return { name: json.name, modules, cables, definitions, settings: json.settings }
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
