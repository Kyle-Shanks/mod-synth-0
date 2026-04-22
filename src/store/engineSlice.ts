import type { StateCreator } from 'zustand'
import type { StoreState } from './index'
import { engine } from '../engine/EngineController'

export interface EngineSlice {
  engineReady: boolean
  engineRevision: number
  meterValues: Record<string, number>
  setEngineReady: (ready: boolean) => void
  bumpEngineRevision: () => void
  setMeterValue: (key: string, peak: number) => void
  setMeterValuesBatch: (
    entries: Array<{ moduleId: string; portId: string; peak: number }>,
  ) => void
  setGate: (moduleId: string, portId: string, value: 0 | 1) => void
  setScopeBuffers: (
    moduleId: string,
    scopeBuffer: SharedArrayBuffer,
    writeIndexBuffer: SharedArrayBuffer,
  ) => void
  setTunerBuffer: (moduleId: string, buffer: SharedArrayBuffer) => void
  setXYScopeBuffers: (
    moduleId: string,
    xBuffer: SharedArrayBuffer,
    yBuffer: SharedArrayBuffer,
    writeIndexBuffer: SharedArrayBuffer,
  ) => void
  setIndicatorBuffer: (moduleId: string, buffer: SharedArrayBuffer) => void
  setSamplerBuffer: (
    moduleId: string,
    buffer: ArrayBuffer,
    sampleRate: number,
  ) => void
  setSamplerPlayheadBuffer: (
    moduleId: string,
    buffer: SharedArrayBuffer,
  ) => void
  triggerSampler: (moduleId: string) => void
  stopSampler: (moduleId: string) => void
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
  setMeterValuesBatch: (entries) => set((s) => {
    if (entries.length === 0) return s
    const next = { ...s.meterValues }
    for (const entry of entries) {
      next[`${entry.moduleId}:${entry.portId}`] = entry.peak
    }
    return { meterValues: next }
  }),

  setGate(moduleId, portId, value) {
    engine.setGate(moduleId, portId, value)
  },

  setScopeBuffers(moduleId, scopeBuffer, writeIndexBuffer) {
    engine.setScopeBuffers(moduleId, scopeBuffer, writeIndexBuffer)
  },

  setTunerBuffer(moduleId, buffer) {
    engine.setTunerBuffer(moduleId, buffer)
  },

  setXYScopeBuffers(moduleId, xBuffer, yBuffer, writeIndexBuffer) {
    engine.setXYScopeBuffers(moduleId, xBuffer, yBuffer, writeIndexBuffer)
  },

  setIndicatorBuffer(moduleId, buffer) {
    engine.setIndicatorBuffer(moduleId, buffer)
  },

  setSamplerBuffer(moduleId, buffer, sampleRate) {
    engine.setSamplerBuffer(moduleId, buffer, sampleRate)
  },

  setSamplerPlayheadBuffer(moduleId, buffer) {
    engine.setSamplerPlayheadBuffer(moduleId, buffer)
  },

  triggerSampler(moduleId) {
    engine.triggerSampler(moduleId)
  },

  stopSampler(moduleId) {
    engine.stopSampler(moduleId)
  },
})
