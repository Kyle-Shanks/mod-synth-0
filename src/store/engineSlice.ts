import type { StateCreator } from 'zustand'
import type { StoreState } from './index'

export interface EngineSlice {
  engineReady: boolean
  engineRevision: number
  meterValues: Record<string, number>
  setEngineReady: (ready: boolean) => void
  bumpEngineRevision: () => void
  setMeterValue: (key: string, peak: number) => void
}

export const createEngineSlice: StateCreator<StoreState, [], [], EngineSlice> = (set) => ({
  engineReady: false,
  engineRevision: 0,
  meterValues: {},

  setEngineReady: (ready) => set({ engineReady: ready }),
  bumpEngineRevision: () => set((s) => ({ engineRevision: s.engineRevision + 1 })),
  setMeterValue: (key, peak) => set((s) => ({
    meterValues: { ...s.meterValues, [key]: peak }
  })),
})
