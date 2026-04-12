import type { ModuleDefinition } from '../../engine/types'
import {
  createWavetableBanks,
  WAVETABLE_BANK_OPTIONS,
  type WavetableBank,
} from './wavetables'

interface WavetableVCOState {
  phase: number
  tableSize: number
  banks: WavetableBank[]
  _meters: Record<string, number>
  [key: string]: unknown
}

export const WavetableVCODefinition: ModuleDefinition<
  {
    frequency: { type: 'cv'; default: 0; label: 'v/oct' }
    fm: { type: 'cv'; default: 0; label: 'fm' }
    waveCv: { type: 'cv'; default: 0; label: 'wave' }
  },
  {
    out: { type: 'audio'; default: 0; label: 'out' }
  },
  {
    bank: {
      type: 'select'
      default: 0
      options: string[]
      label: 'bank'
    }
    frequency: {
      type: 'float'
      min: 20
      max: 20000
      default: 220
      label: 'freq'
      unit: 'hz'
      curve: 'log'
    }
    detune: {
      type: 'float'
      min: -100
      max: 100
      default: 0
      label: 'tune'
      unit: 'ct'
    }
    position: { type: 'float'; min: 0; max: 4; default: 1; label: 'wave' }
    warp: { type: 'float'; min: 0; max: 1; default: 0; label: 'warp' }
    mult: { type: 'float'; min: 1; max: 4; default: 1; label: 'mult' }
  },
  WavetableVCOState
> = {
  id: 'wavetablevco',
  name: 'wavetable vco',
  category: 'source',
  width: 5,
  height: 5,

  inputs: {
    frequency: { type: 'cv', default: 0, label: 'v/oct' },
    fm: { type: 'cv', default: 0, label: 'fm' },
    waveCv: { type: 'cv', default: 0, label: 'wave' },
  },
  outputs: {
    out: { type: 'audio', default: 0, label: 'out' },
  },
  params: {
    bank: {
      type: 'select',
      default: 0,
      options: [...WAVETABLE_BANK_OPTIONS],
      label: 'bank',
    },
    frequency: {
      type: 'float',
      min: 20,
      max: 20000,
      default: 220,
      label: 'freq',
      unit: 'hz',
      curve: 'log',
    },
    detune: {
      type: 'float',
      min: -100,
      max: 100,
      default: 0,
      label: 'tune',
      unit: 'ct',
    },
    position: { type: 'float', min: 0, max: 4, default: 1, label: 'wave' },
    warp: { type: 'float', min: 0, max: 1, default: 0, label: 'warp' },
    mult: { type: 'float', min: 1, max: 4, default: 1, label: 'mult' },
  },

  initialize(): WavetableVCOState {
    const tableSize = 2048
    const banks = createWavetableBanks(tableSize)

    return {
      phase: 0,
      tableSize,
      banks,
      _meters: { wavePosNorm: 0 },
    }
  },

  process(inputs, outputs, params, state, context) {
    const banks = state.banks as WavetableBank[]
    const bankCount = banks.length
    const tableSize = state.tableSize as number

    if (bankCount === 0 || tableSize <= 1) {
      for (let i = 0; i < 128; i++) outputs.out[i] = 0
      return
    }

    const bankIndex = Math.max(
      0,
      Math.min(bankCount - 1, Math.round(params.bank)),
    )
    const tables = banks[bankIndex] as WavetableBank
    const tableCount = tables.length
    const sampleRate = context.sampleRate
    const detuneRatio = Math.pow(2, params.detune / 1200)
    const maxTablePosition = tableCount - 1
    const twoPi = 2 * Math.PI
    const waveCvDepth = 1.5
    const cycleMult = Math.max(1, params.mult)
    const warpAmount = Math.max(0, Math.min(1, params.warp))
    const warpDepth = warpAmount * 0.3
    let tablePosAcc = 0
    let phase = state.phase as number

    for (let i = 0; i < 128; i++) {
      const voct = inputs.frequency[i] ?? 0
      const baseFreq = params.frequency * Math.pow(2, voct)
      const fm = inputs.fm[i] ?? 0
      const freq = Math.max(
        0.001,
        baseFreq * detuneRatio + fm * params.frequency,
      )

      phase += freq / sampleRate
      phase -= Math.floor(phase)

      const waveCv = inputs.waveCv[i] ?? 0
      const rawPosition = params.position + waveCv * waveCvDepth
      const tablePosition = Math.max(0, Math.min(maxTablePosition, rawPosition))
      tablePosAcc += tablePosition
      const tableAIndex = Math.floor(tablePosition)
      const tableBIndex = Math.min(maxTablePosition, tableAIndex + 1)
      const tableMix = tablePosition - tableAIndex

      const phaseWarped =
        phase * cycleMult + Math.sin(phase * twoPi * cycleMult) * warpDepth
      const wrappedPhase = phaseWarped - Math.floor(phaseWarped)
      const tablePhase = wrappedPhase * tableSize
      const readIndex = Math.floor(tablePhase)
      const readNext = (readIndex + 1) % tableSize
      const frac = tablePhase - readIndex

      const tableA = tables[tableAIndex] as Float32Array
      const tableB = tables[tableBIndex] as Float32Array

      const sampleA =
        (tableA[readIndex] ?? 0) * (1 - frac) + (tableA[readNext] ?? 0) * frac
      const sampleB =
        (tableB[readIndex] ?? 0) * (1 - frac) + (tableB[readNext] ?? 0) * frac

      outputs.out[i] = (sampleA + (sampleB - sampleA) * tableMix) * 0.8
    }

    ;(state._meters as Record<string, number>).wavePosNorm =
      maxTablePosition > 0
        ? Math.max(0, Math.min(1, tablePosAcc / 128 / maxTablePosition))
        : 0
    state.phase = phase
  },
}
