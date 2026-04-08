import type { StateCreator } from 'zustand'
import type { StoreState } from './index'
import type { ModuleInstance } from './patchSlice'
import type { SerializedCable, SubpatchDefinition } from '../engine/types'

interface HistoryEntry {
  modules: Record<string, ModuleInstance>
  cables: Record<string, SerializedCable>
  patchName: string
  definitions: Record<string, SubpatchDefinition>
}

export interface HistorySlice {
  past: HistoryEntry[]
  future: HistoryEntry[]
  stagedEntry: HistoryEntry | null
  pushHistory: () => void
  stageHistory: () => void
  commitHistory: () => void
  clearHistory: () => void
  undo: () => void
  redo: () => void
}

const MAX_HISTORY = 50

// Strip any internal subpatch modules/cables injected into state during drill-down.
// History entries must only contain root-level state so undo/redo never restores
// injected internal data as if it were root data.
function rootSnapshot(state: StoreState): { modules: Record<string, ModuleInstance>; cables: Record<string, SerializedCable> } {
  const internalModuleIds = new Set<string>()
  const internalCableIds = new Set<string>()
  for (const def of Object.values(state.definitions)) {
    for (const id of Object.keys(def.modules)) internalModuleIds.add(id)
    for (const id of Object.keys(def.cables)) internalCableIds.add(id)
  }
  const modules: Record<string, ModuleInstance> = {}
  for (const [id, mod] of Object.entries(state.modules)) {
    if (!internalModuleIds.has(id)) modules[id] = mod
  }
  const cables: Record<string, SerializedCable> = {}
  for (const [id, cable] of Object.entries(state.cables)) {
    if (!internalCableIds.has(id)) cables[id] = cable
  }
  return { modules, cables }
}

export const createHistorySlice: StateCreator<StoreState, [], [], HistorySlice> = (set, get) => ({
  past: [],
  future: [],
  stagedEntry: null,

  pushHistory() {
    // Never record history while drilled into a subpatch — root history must stay isolated.
    if (get().subpatchContext.length > 0) return
    const state = get()
    const { modules, cables } = rootSnapshot(state)
    const entry: HistoryEntry = {
      modules: structuredClone(modules),
      cables: structuredClone(cables),
      patchName: state.patchName,
      definitions: structuredClone(state.definitions),
    }
    set((s) => ({
      past: [...s.past, entry].slice(-MAX_HISTORY),
      future: [],
    }))
  },

  stageHistory() {
    if (get().subpatchContext.length > 0) return
    const state = get()
    const { modules, cables } = rootSnapshot(state)
    set({
      stagedEntry: {
        modules: structuredClone(modules),
        cables: structuredClone(cables),
        patchName: state.patchName,
        definitions: structuredClone(state.definitions),
      },
    })
  },

  commitHistory() {
    if (get().subpatchContext.length > 0) {
      // Discard any staged entry from before we drilled in; don't push anything.
      set({ stagedEntry: null })
      return
    }
    const { stagedEntry, patchName } = get()
    if (!stagedEntry) return
    set({ stagedEntry: null })
    const { modules, cables } = rootSnapshot(get())
    // only push if something actually changed
    if (
      JSON.stringify(stagedEntry.modules) === JSON.stringify(modules) &&
      JSON.stringify(stagedEntry.cables) === JSON.stringify(cables) &&
      stagedEntry.patchName === patchName
    ) return
    set((s) => ({
      past: [...s.past, stagedEntry].slice(-MAX_HISTORY),
      future: [],
    }))
  },

  clearHistory() {
    set({ past: [], future: [], stagedEntry: null })
  },

  undo() {
    // Undo is disabled while inside a subpatch — root history must not be disturbed.
    if (get().subpatchContext.length > 0) return
    const state = get()
    const { past, patchName, definitions, loadPatch } = state
    if (past.length === 0) return
    const prev = past[past.length - 1]!
    const { modules, cables } = rootSnapshot(state)
    const current: HistoryEntry = {
      modules: structuredClone(modules),
      cables: structuredClone(cables),
      patchName,
      definitions: structuredClone(definitions),
    }
    const newPast = past.slice(0, -1)
    const newFuture = [current, ...state.future].slice(0, MAX_HISTORY)
    // loadPatch calls clearHistory — restore the computed stacks after
    loadPatch(prev.patchName, prev.modules, prev.cables, prev.definitions)
    set({ past: newPast, future: newFuture })
  },

  redo() {
    if (get().subpatchContext.length > 0) return
    const state = get()
    const { future, patchName, definitions, loadPatch } = state
    if (future.length === 0) return
    const next = future[0]!
    const { modules, cables } = rootSnapshot(state)
    const current: HistoryEntry = {
      modules: structuredClone(modules),
      cables: structuredClone(cables),
      patchName,
      definitions: structuredClone(definitions),
    }
    const newFuture = future.slice(1)
    const newPast = [...state.past, current].slice(-MAX_HISTORY)
    // loadPatch calls clearHistory — restore the computed stacks after
    loadPatch(next.patchName, next.modules, next.cables, next.definitions)
    set({ past: newPast, future: newFuture })
  },
})
