import { engine } from '../engine/EngineController'
import { useStore } from '../store'

const STRESS_VOICES = 18
const KNOB_SWEEPS = 360
const REPATCH_STEPS = 120
let harnessCableCounter = 0

function makeCableId(prefix: string, idx: number): string {
  harnessCableCounter += 1
  return `${prefix}-${idx}-${harnessCableCounter}`
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))
  return sorted[index] ?? 0
}

async function sampleFrameTimes(frameCount: number): Promise<{ avgMs: number; p95Ms: number; maxMs: number }> {
  if (frameCount <= 0) return { avgMs: 0, p95Ms: 0, maxMs: 0 }
  const samples: number[] = []
  let previous = performance.now()
  for (let i = 0; i < frameCount; i++) {
    const now = await new Promise<number>((resolve) => requestAnimationFrame((ts) => resolve(ts)))
    samples.push(now - previous)
    previous = now
  }
  const sum = samples.reduce((acc, value) => acc + value, 0)
  return {
    avgMs: samples.length > 0 ? sum / samples.length : 0,
    p95Ms: percentile(samples, 0.95),
    maxMs: Math.max(...samples),
  }
}

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

function clampGrid(value: number): number {
  return Math.max(0, Math.min(63, value))
}

export interface PerformanceHarnessResult {
  voices: number
  modules: number
  cables: number
  frame: {
    baseline: { avgMs: number; p95Ms: number; maxMs: number }
    duringStress: { avgMs: number; p95Ms: number; maxMs: number }
  }
  meter: {
    legacyEvents: number
    batchEvents: number
    batchEntries: number
  }
  updates: {
    storeUpdates: number
    paramWrites: number
    repatchOps: number
  }
  audio: {
    workletErrors: number
  }
}

export async function runPerformanceHarness(): Promise<PerformanceHarnessResult> {
  harnessCableCounter = 0
  const state = useStore.getState()
  state.exitToRoot()
  state.clearPatch()

  let storeUpdates = 0
  let legacyMeterEvents = 0
  let meterBatchEvents = 0
  let meterBatchEntries = 0
  let workletErrors = 0

  const unsubscribeStore = useStore.subscribe(() => {
    storeUpdates++
  })

  const unsubscribeEngine = engine.onEvent((event) => {
    if (event.type === 'METER') legacyMeterEvents++
    if (event.type === 'METER_BATCH') {
      meterBatchEvents++
      meterBatchEntries += event.entries.length
    }
    if (event.type === 'ERROR') workletErrors++
  })

  try {
    const outputId = state.addModule('output', { x: 58, y: 14 })
    if (!outputId) {
      throw new Error('failed to create output module for performance harness')
    }

    const vcoIds: string[] = []
    const vcfIds: string[] = []
    const vcaIds: string[] = []

    for (let i = 0; i < STRESS_VOICES; i++) {
      const row = i % 9
      const col = Math.floor(i / 9)
      const xBase = clampGrid(col * 18)
      const yBase = clampGrid(row * 3)

      const vcoId = state.addModule('vco', { x: xBase, y: yBase })
      const vcfId = state.addModule('vcf', { x: xBase + 5, y: yBase })
      const vcaId = state.addModule('vca', { x: xBase + 10, y: yBase })
      if (!vcoId || !vcfId || !vcaId) continue

      vcoIds.push(vcoId)
      vcfIds.push(vcfId)
      vcaIds.push(vcaId)

      state.addCable({
        id: makeCableId('perf-vco-vcf', i),
        from: { moduleId: vcoId, portId: 'saw' },
        to: { moduleId: vcfId, portId: 'audio' },
      })
      state.addCable({
        id: makeCableId('perf-vcf-vca', i),
        from: { moduleId: vcfId, portId: 'out' },
        to: { moduleId: vcaId, portId: 'audio' },
      })
      state.addCable({
        id: makeCableId('perf-vca-out', i),
        from: { moduleId: vcaId, portId: 'out' },
        to: { moduleId: outputId, portId: i % 2 === 0 ? 'left' : 'right' },
      })
    }

    await nextFrame()
    const baselineFrame = await sampleFrameTimes(180)

    let paramWrites = 0
    for (let i = 0; i < KNOB_SWEEPS; i++) {
      const vcfId = vcfIds[i % Math.max(1, vcfIds.length)]
      const vcaId = vcaIds[i % Math.max(1, vcaIds.length)]
      if (vcfId) {
        const cutoff = 180 + ((i * 37) % 6800)
        state.setParam(vcfId, 'cutoff', cutoff)
        paramWrites++
      }
      if (vcaId) {
        const gain = 0.25 + ((i * 13) % 70) / 100
        state.setParam(vcaId, 'gain', gain)
        paramWrites++
      }
      if (i % 6 === 0) {
        await nextFrame()
      }
    }

    const currentCables = Object.values(useStore.getState().cables).filter(
      (c) => c.to.moduleId === outputId,
    )

    let repatchOps = 0
    for (let i = 0; i < Math.min(REPATCH_STEPS, currentCables.length); i++) {
      const cable = currentCables[i]
      if (!cable) continue
      state.removeCable(cable.id)
      state.addCable({
        id: makeCableId('perf-repatch', i),
        from: { ...cable.from },
        to: {
          moduleId: outputId,
          portId: cable.to.portId === 'left' ? 'right' : 'left',
        },
      })
      repatchOps++
      if (i % 8 === 0) {
        await nextFrame()
      }
    }

    await nextFrame()
    const stressFrame = await sampleFrameTimes(180)

    const endState = useStore.getState()
    return {
      voices: vcaIds.length,
      modules: Object.keys(endState.modules).length,
      cables: Object.keys(endState.cables).length,
      frame: {
        baseline: baselineFrame,
        duringStress: stressFrame,
      },
      meter: {
        legacyEvents: legacyMeterEvents,
        batchEvents: meterBatchEvents,
        batchEntries: meterBatchEntries,
      },
      updates: {
        storeUpdates,
        paramWrites,
        repatchOps,
      },
      audio: {
        workletErrors,
      },
    }
  } finally {
    unsubscribeEngine()
    unsubscribeStore()
  }
}

declare global {
  interface Window {
    __modsynthPerf?: {
      run: () => Promise<PerformanceHarnessResult>
    }
  }
}

export function registerPerformanceHarness(): void {
  if (typeof window === 'undefined') return
  window.__modsynthPerf = {
    run: runPerformanceHarness,
  }
}
