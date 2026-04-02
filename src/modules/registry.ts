import type { ModuleDefinition } from '../engine/types'
import { VCODefinition } from './vco/definition'
import { OutputDefinition } from './output/definition'

const registry = new Map<string, ModuleDefinition>()

export function registerModule(def: ModuleDefinition): void {
  if (registry.has(def.id)) {
    console.warn(`module '${def.id}' is already registered — overwriting`)
  }
  registry.set(def.id, def)
}

export function getModule(id: string): ModuleDefinition | undefined {
  return registry.get(id)
}

export function getAllModules(): ModuleDefinition[] {
  return [...registry.values()]
}

// register core modules
// eslint-disable-next-line @typescript-eslint/no-explicit-any
registerModule(VCODefinition as any as ModuleDefinition)
registerModule(OutputDefinition)
