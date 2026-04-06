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
  }>
  cables: Array<{
    from: SerializedCable['from']
    to: SerializedCable['to']
  }>
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
}

export const createUISlice: StateCreator<StoreState, [], [], UISlice> = (set) => ({
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
})
