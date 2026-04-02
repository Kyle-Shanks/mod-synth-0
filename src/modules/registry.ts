import type { ModuleDefinition } from '../engine/types'
import { VCODefinition } from './vco/definition'
import { VCFDefinition } from './vcf/definition'
import { VCADefinition } from './vca/definition'
import { MixerDefinition } from './mixer/definition'
import { ADSRDefinition } from './adsr/definition'
import { PushButtonDefinition } from './pushbutton/definition'
import { ScopeDefinition } from './scope/definition'
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

// register all core modules
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reg = (def: any) => registerModule(def as ModuleDefinition)
reg(VCODefinition)
reg(VCFDefinition)
reg(VCADefinition)
reg(MixerDefinition)
reg(ADSRDefinition)
reg(PushButtonDefinition)
reg(ScopeDefinition)
reg(OutputDefinition)
