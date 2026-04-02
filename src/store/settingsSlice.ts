import type { StateCreator } from 'zustand'
import type { StoreState } from './index'

export interface SettingsSlice {
  themeId: string
  cableTautness: number
  tooltipsEnabled: boolean
  setTheme: (id: string) => void
  setCableTautness: (v: number) => void
  setTooltipsEnabled: (v: boolean) => void
}

export const createSettingsSlice: StateCreator<StoreState, [], [], SettingsSlice> = (set) => ({
  themeId: 'dark',
  cableTautness: 0.5,
  tooltipsEnabled: true,

  setTheme: (id) => set({ themeId: id }),
  setCableTautness: (v) => set({ cableTautness: v }),
  setTooltipsEnabled: (v) => set({ tooltipsEnabled: v }),
})
