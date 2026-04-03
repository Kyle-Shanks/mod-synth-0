import { create } from 'zustand'
import { createPatchSlice, type PatchSlice } from './patchSlice'
import { createUISlice, type UISlice } from './uiSlice'
import { createSettingsSlice, type SettingsSlice } from './settingsSlice'
import { createEngineSlice, type EngineSlice } from './engineSlice'
import { createHistorySlice, type HistorySlice } from './historySlice'

export type StoreState = PatchSlice & UISlice & SettingsSlice & EngineSlice & HistorySlice

export const useStore = create<StoreState>()((...args) => ({
  ...createPatchSlice(...args),
  ...createUISlice(...args),
  ...createSettingsSlice(...args),
  ...createEngineSlice(...args),
  ...createHistorySlice(...args),
}))
