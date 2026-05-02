import type { StateCreator } from 'zustand'
import type { CableDragState } from '../cables/CableDragState'
import type { StoreState } from './index'
import type { ModuleInstance } from './patchSlice'
import type { SerializedCable } from '../engine/types'

export interface ModuleClipboardData {
  modules: Array<{
    sourceId: string
    definitionId: string
    position: { x: number; y: number }
    params: Record<string, number>
    data?: ModuleInstance['data']
    subpatchDefinitionId?: string
    macroValues?: Record<string, number>
    containerWidth?: number
    containerHeight?: number
  }>
  cables: Array<{
    from: SerializedCable['from']
    to: SerializedCable['to']
  }>
}

export interface SubpatchContextEntry {
  instanceId: string
  definitionId: string
  name: string
}

export interface UISlice {
  selectedModuleId: string | null
  selectedModuleIds: string[]
  hoveredPortKey: string | null  // 'moduleId:portId'
  hoveredCableId: string | null
  dragState: CableDragState | null
  commandPaletteOpen: boolean
  commandPalettePosition: { x: number; y: number } | null
  settingsPanelOpen: boolean
  zoom: number
  moduleClipboard: ModuleClipboardData | null
  moduleClipboardPasteCount: number
  // subpatch drill-down navigation stack (empty = root)
  subpatchContext: SubpatchContextEntry[]
  setSelectedModule: (id: string | null) => void
  setSelectedModules: (ids: string[]) => void
  setHoveredPort: (key: string | null) => void
  setHoveredCable: (id: string | null) => void
  setDragState: (state: CableDragState | null) => void
  setCommandPaletteOpen: (open: boolean, position?: { x: number; y: number }) => void
  setSettingsPanelOpen: (open: boolean) => void
  setZoom: (z: number) => void
  setModuleClipboard: (clipboard: ModuleClipboardData | null) => void
  setModuleClipboardPasteCount: (count: number) => void
  enterSubpatch: (instanceId: string, definitionId: string, name: string) => void
  exitSubpatch: () => void
  exitToRoot: () => void
}

export const createUISlice: StateCreator<StoreState, [], [], UISlice> = (set, get) => ({
  selectedModuleId: null,
  selectedModuleIds: [],
  hoveredPortKey: null,
  hoveredCableId: null,
  dragState: null,
  commandPaletteOpen: false,
  commandPalettePosition: null,
  settingsPanelOpen: false,
  zoom: 1,
  moduleClipboard: null,
  moduleClipboardPasteCount: 0,
  subpatchContext: [],

  setSelectedModule: (id) => set({
    selectedModuleId: id,
    selectedModuleIds: id ? [id] : [],
  }),
  setSelectedModules: (ids) => {
    const deduped = [...new Set(ids)]
    set({
      selectedModuleId: deduped[0] ?? null,
      selectedModuleIds: deduped,
    })
  },
  setHoveredPort: (key) => set({ hoveredPortKey: key }),
  setHoveredCable: (id) => set({ hoveredCableId: id }),
  setDragState: (state) => set({ dragState: state }),
  setCommandPaletteOpen: (open, position) => set({
    commandPaletteOpen: open,
    commandPalettePosition: position ?? null,
  }),
  setSettingsPanelOpen: (open) => set({ settingsPanelOpen: open }),
  setZoom: (z) => set({ zoom: Math.max(0.25, Math.min(2.0, z)) }),
  setModuleClipboard: (clipboard) => set({ moduleClipboard: clipboard }),
  setModuleClipboardPasteCount: (count) => set({ moduleClipboardPasteCount: Math.max(0, count) }),

  enterSubpatch(instanceId, definitionId, name) {
    const def = get().definitions[definitionId]
    if (!def) return
    // inject internal modules and cables into state so existing components work unmodified
    set((s) => ({
      subpatchContext: [...s.subpatchContext, { instanceId, definitionId, name }],
      selectedModuleId: null,
      selectedModuleIds: [],
      modules: { ...s.modules, ...def.modules },
      cables: { ...s.cables, ...def.cables },
    }))
  },
  exitSubpatch() {
    const state = get()
    const current = state.subpatchContext[state.subpatchContext.length - 1]
    if (!current) return
    const def = state.definitions[current.definitionId]
    // eject injected modules and cables from state.modules/cables
    const newModules = { ...state.modules }
    const newCables = { ...state.cables }
    const newFeedback = new Set(state.feedbackCableIds)
    if (def) {
      for (const id of Object.keys(def.modules)) delete newModules[id]
      for (const id of Object.keys(def.cables)) { delete newCables[id]; newFeedback.delete(id) }
    }
    set({
      modules: newModules,
      cables: newCables,
      feedbackCableIds: newFeedback,
      subpatchContext: state.subpatchContext.slice(0, -1),
      selectedModuleId: null,
      selectedModuleIds: [],
    })
    // rebuild all other instances of this definition
    get().syncAllInstances(current.definitionId)
  },
  exitToRoot() {
    const state = get()
    const current = state.subpatchContext[state.subpatchContext.length - 1]
    const def = current ? state.definitions[current.definitionId] : null
    const newModules = { ...state.modules }
    const newCables = { ...state.cables }
    const newFeedback = new Set(state.feedbackCableIds)
    if (def) {
      for (const id of Object.keys(def.modules)) delete newModules[id]
      for (const id of Object.keys(def.cables)) { delete newCables[id]; newFeedback.delete(id) }
    }
    set({
      modules: newModules,
      cables: newCables,
      feedbackCableIds: newFeedback,
      subpatchContext: [],
      selectedModuleId: null,
      selectedModuleIds: [],
    })
    if (current) get().syncAllInstances(current.definitionId)
  },
})
