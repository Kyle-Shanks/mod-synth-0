import type { StateCreator } from 'zustand'
import type { StoreState } from './index'

export interface EngineSlice {
  engineReady: boolean
  meterValues: Record<string, number>
  setEngineReady: (ready: boolean) => void
  setMeterValue: (key: string, peak: number) => void
}

export const createEngineSlice: StateCreator<StoreState, [], [], EngineSlice> = (set) => ({
  engineReady: false,
  meterValues: {},

  setEngineReady: (ready) => set({ engineReady: ready }),
  setMeterValue: (key, peak) => set((s) => ({
    meterValues: { ...s.meterValues, [key]: peak }
  })),
})
