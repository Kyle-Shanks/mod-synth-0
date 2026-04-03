import type { StateCreator } from 'zustand'
import type { StoreState } from './index'
import type { ModuleInstance } from './patchSlice'
import type { SerializedCable } from '../engine/types'

interface HistoryEntry {
  modules: Record<string, ModuleInstance>
  cables: Record<string, SerializedCable>
  patchName: string
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

export const createHistorySlice: StateCreator<StoreState, [], [], HistorySlice> = (set, get) => ({
  past: [],
  future: [],
  stagedEntry: null,

  pushHistory() {
    const { modules, cables, patchName } = get()
    const entry: HistoryEntry = {
      modules: structuredClone(modules),
      cables: structuredClone(cables),
      patchName,
    }
    set((s) => ({
      past: [...s.past, entry].slice(-MAX_HISTORY),
      future: [],
    }))
  },

  stageHistory() {
    const { modules, cables, patchName } = get()
    set({
      stagedEntry: {
        modules: structuredClone(modules),
        cables: structuredClone(cables),
        patchName,
      },
    })
  },

  commitHistory() {
    const { stagedEntry, modules, cables, patchName } = get()
    if (!stagedEntry) return
    set({ stagedEntry: null })
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
    const { past, modules, cables, patchName, loadPatch } = get()
    if (past.length === 0) return
    const prev = past[past.length - 1]!
    const current: HistoryEntry = {
      modules: structuredClone(modules),
      cables: structuredClone(cables),
      patchName,
    }
    const newPast = past.slice(0, -1)
    const newFuture = [current, ...get().future].slice(0, MAX_HISTORY)
    // loadPatch calls clearHistory — restore the computed stacks after
    loadPatch(prev.patchName, prev.modules, prev.cables)
    set({ past: newPast, future: newFuture })
  },

  redo() {
    const { future, modules, cables, patchName, loadPatch } = get()
    if (future.length === 0) return
    const next = future[0]!
    const current: HistoryEntry = {
      modules: structuredClone(modules),
      cables: structuredClone(cables),
      patchName,
    }
    const newFuture = future.slice(1)
    const newPast = [...get().past, current].slice(-MAX_HISTORY)
    // loadPatch calls clearHistory — restore the computed stacks after
    loadPatch(next.patchName, next.modules, next.cables)
    set({ past: newPast, future: newFuture })
  },
})
