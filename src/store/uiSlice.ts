import type { StateCreator } from 'zustand'
import type { CableDragState } from '../cables/CableDragState'
import type { StoreState } from './index'

export interface UISlice {
  selectedModuleId: string | null
  hoveredPortKey: string | null  // 'moduleId:portId'
  hoveredCableId: string | null
  dragState: CableDragState | null
  commandPaletteOpen: boolean
  commandPalettePosition: { x: number; y: number } | null
  settingsPanelOpen: boolean
  zoom: number
  setSelectedModule: (id: string | null) => void
  setHoveredPort: (key: string | null) => void
  setHoveredCable: (id: string | null) => void
  setDragState: (state: CableDragState | null) => void
  setCommandPaletteOpen: (open: boolean, position?: { x: number; y: number }) => void
  setSettingsPanelOpen: (open: boolean) => void
  setZoom: (z: number) => void
}

export const createUISlice: StateCreator<StoreState, [], [], UISlice> = (set) => ({
  selectedModuleId: null,
  hoveredPortKey: null,
  hoveredCableId: null,
  dragState: null,
  commandPaletteOpen: false,
  commandPalettePosition: null,
  settingsPanelOpen: false,
  zoom: 1,

  setSelectedModule: (id) => set({ selectedModuleId: id }),
  setHoveredPort: (key) => set({ hoveredPortKey: key }),
  setHoveredCable: (id) => set({ hoveredCableId: id }),
  setDragState: (state) => set({ dragState: state }),
  setCommandPaletteOpen: (open, position) => set({
    commandPaletteOpen: open,
    commandPalettePosition: position ?? null,
  }),
  setSettingsPanelOpen: (open) => set({ settingsPanelOpen: open }),
  setZoom: (z) => set({ zoom: Math.max(0.25, Math.min(2.0, z)) }),
})
