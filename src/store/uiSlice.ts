import type { StateCreator } from 'zustand'
import type { CableDragState } from '../cables/CableDragState'
import type { StoreState } from './index'

export interface UISlice {
  selectedModuleId: string | null
  hoveredPortKey: string | null  // 'moduleId:portId'
  dragState: CableDragState | null
  commandPaletteOpen: boolean
  commandPalettePosition: { x: number; y: number } | null
  setSelectedModule: (id: string | null) => void
  setHoveredPort: (key: string | null) => void
  setDragState: (state: CableDragState | null) => void
  setCommandPaletteOpen: (open: boolean, position?: { x: number; y: number }) => void
}

export const createUISlice: StateCreator<StoreState, [], [], UISlice> = (set) => ({
  selectedModuleId: null,
  hoveredPortKey: null,
  dragState: null,
  commandPaletteOpen: false,
  commandPalettePosition: null,

  setSelectedModule: (id) => set({ selectedModuleId: id }),
  setHoveredPort: (key) => set({ hoveredPortKey: key }),
  setDragState: (state) => set({ dragState: state }),
  setCommandPaletteOpen: (open, position) => set({
    commandPaletteOpen: open,
    commandPalettePosition: position ?? null,
  }),
})
