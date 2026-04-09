import type { SerializedCable } from '../engine/types'
import type { TutorialRuntime } from './model'

export function modulesByDefinition(
  runtime: TutorialRuntime,
  definitionId: string,
): string[] {
  return Object.entries(runtime.modules)
    .filter(([, mod]) => mod.definitionId === definitionId)
    .map(([id]) => id)
}

export function firstModuleByDefinition(
  runtime: TutorialRuntime,
  definitionId: string,
): string | null {
  return modulesByDefinition(runtime, definitionId)[0] ?? null
}

export function findCable(
  runtime: TutorialRuntime,
  fromModuleId: string,
  fromPortId: string,
  toModuleId: string,
  toPortId: string,
): string | null {
  for (const [cableId, cable] of Object.entries(runtime.cables)) {
    if (
      cable.from.moduleId === fromModuleId &&
      cable.from.portId === fromPortId &&
      cable.to.moduleId === toModuleId &&
      cable.to.portId === toPortId
    ) {
      return cableId
    }
  }
  return null
}

export function hasCable(
  runtime: TutorialRuntime,
  fromModuleId: string,
  fromPortId: string,
  toModuleId: string,
  toPortId: string,
): boolean {
  return (
    findCable(runtime, fromModuleId, fromPortId, toModuleId, toPortId) !== null
  )
}

function createCableId(): string {
  return `tutorial-cable-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function ensureModule(
  runtime: TutorialRuntime,
  definitionId: string,
  position: { x: number; y: number },
): string | null {
  const existing = firstModuleByDefinition(runtime, definitionId)
  if (existing) return existing
  const created = runtime.addModule(definitionId, position)
  return created || null
}

export function ensureCable(
  runtime: TutorialRuntime,
  from: SerializedCable['from'],
  to: SerializedCable['to'],
): void {
  if (hasCable(runtime, from.moduleId, from.portId, to.moduleId, to.portId)) {
    return
  }
  runtime.addCable({ id: createCableId(), from, to })
}

export function rootModuleIds(runtime: TutorialRuntime): string[] {
  if (runtime.subpatchContext.length > 0) {
    return []
  }
  const internalIds = new Set<string>()
  for (const def of Object.values(runtime.definitions)) {
    for (const moduleId of Object.keys(def.modules)) internalIds.add(moduleId)
  }
  return Object.keys(runtime.modules).filter((id) => !internalIds.has(id))
}

export function countRootModules(runtime: TutorialRuntime): number {
  return rootModuleIds(runtime).length
}
