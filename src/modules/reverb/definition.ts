import type { ModuleDefinition } from '../../engine/types'

interface ReverbState {
  // comb filter delay lines (4 comb filters, Schroeder topology)
  comb0: Float32Array | null
  comb1: Float32Array | null
  comb2: Float32Array | null
  comb3: Float32Array | null
  combIdx0: number
  combIdx1: number
  combIdx2: number
  combIdx3: number
  // allpass filter delay lines (2 allpass filters)
  ap0: Float32Array | null
  ap1: Float32Array | null
  apIdx0: number
  apIdx1: number
  initialized: boolean
  [key: string]: unknown
}

export const ReverbDefinition: ModuleDefinition<
  {
    audio: { type: 'audio'; default: 0; label: 'in' }
  },
  {
    out: { type: 'audio'; default: 0; label: 'out' }
  },
  {
    mix: { type: 'float'; min: 0; max: 1; default: 0.3; label: 'mix' }
    decay: {
      type: 'float'
      min: 0.1
      max: 10
      default: 2
      label: 'decay'
      unit: 's'
    }
    damping: {
      type: 'float'
      min: 0
      max: 1
      default: 0.5
      label: 'damp'
    }
  },
  ReverbState
> = {
  id: 'reverb',
  name: 'reverb',
  category: 'fx',
  width: 3,
  height: 3,

  inputs: {
    audio: { type: 'audio', default: 0, label: 'in' },
  },
  outputs: {
    out: { type: 'audio', default: 0, label: 'out' },
  },
  params: {
    mix: { type: 'float', min: 0, max: 1, default: 0.3, label: 'mix' },
    decay: {
      type: 'float',
      min: 0.1,
      max: 10,
      default: 2,
      label: 'decay',
      unit: 's',
    },
    damping: {
      type: 'float',
      min: 0,
      max: 1,
      default: 0.5,
      label: 'damp',
    },
  },

  initialize(): ReverbState {
    return {
      comb0: null,
      comb1: null,
      comb2: null,
      comb3: null,
      combIdx0: 0,
      combIdx1: 0,
      combIdx2: 0,
      combIdx3: 0,
      ap0: null,
      ap1: null,
      apIdx0: 0,
      apIdx1: 0,
      initialized: false,
    }
  },

  process(inputs, outputs, params, state, context) {
    const sampleRate = context.sampleRate

    // lazy-init delay lines at audio rate (first call)
    if (!state.initialized) {
      // comb filter delay times in ms (mutually prime-ish, Schroeder-style)
      // scaled for 44100, but work at any rate
      const scale = sampleRate / 44100
      state.comb0 = new Float32Array(Math.round(1557 * scale))
      state.comb1 = new Float32Array(Math.round(1617 * scale))
      state.comb2 = new Float32Array(Math.round(1491 * scale))
      state.comb3 = new Float32Array(Math.round(1422 * scale))
      state.ap0 = new Float32Array(Math.round(225 * scale))
      state.ap1 = new Float32Array(Math.round(556 * scale))
      state.combIdx0 = 0
      state.combIdx1 = 0
      state.combIdx2 = 0
      state.combIdx3 = 0
      state.apIdx0 = 0
      state.apIdx1 = 0
      state.initialized = true
    }

    const c0 = state.comb0 as Float32Array
    const c1 = state.comb1 as Float32Array
    const c2 = state.comb2 as Float32Array
    const c3 = state.comb3 as Float32Array
    const a0 = state.ap0 as Float32Array
    const a1 = state.ap1 as Float32Array

    // feedback coefficient from desired decay time
    // RT60 = -60dB in 'decay' seconds. average comb delay ~1522 samples
    const avgDelay = (c0.length + c1.length + c2.length + c3.length) / 4
    const feedback = Math.pow(0.001, avgDelay / (params.decay * sampleRate))
    const damp = params.damping
    const wet = params.mix
    const dry = 1 - wet

    for (let i = 0; i < 128; i++) {
      const input = inputs.audio[i] ?? 0

      // parallel comb filters with damping (lowpass in feedback loop)
      let idx: number
      let delayed: number
      let filtered: number

      // comb 0
      idx = state.combIdx0 as number
      delayed = c0[idx]!
      filtered =
        delayed * (1 - damp) + c0[(idx - 1 + c0.length) % c0.length]! * damp
      c0[idx] = input + filtered * feedback
      state.combIdx0 = (idx + 1) % c0.length
      let combOut = delayed

      // comb 1
      idx = state.combIdx1 as number
      delayed = c1[idx]!
      filtered =
        delayed * (1 - damp) + c1[(idx - 1 + c1.length) % c1.length]! * damp
      c1[idx] = input + filtered * feedback
      state.combIdx1 = (idx + 1) % c1.length
      combOut += delayed

      // comb 2
      idx = state.combIdx2 as number
      delayed = c2[idx]!
      filtered =
        delayed * (1 - damp) + c2[(idx - 1 + c2.length) % c2.length]! * damp
      c2[idx] = input + filtered * feedback
      state.combIdx2 = (idx + 1) % c2.length
      combOut += delayed

      // comb 3
      idx = state.combIdx3 as number
      delayed = c3[idx]!
      filtered =
        delayed * (1 - damp) + c3[(idx - 1 + c3.length) % c3.length]! * damp
      c3[idx] = input + filtered * feedback
      state.combIdx3 = (idx + 1) % c3.length
      combOut += delayed

      // scale comb sum
      combOut *= 0.25

      // series allpass filters for diffusion
      // allpass 0
      let apIdx = state.apIdx0 as number
      let apDelayed = a0[apIdx]!
      let apInput = combOut + apDelayed * 0.5
      a0[apIdx] = apInput
      let apOut = apDelayed - apInput * 0.5
      state.apIdx0 = (apIdx + 1) % a0.length

      // allpass 1
      apIdx = state.apIdx1 as number
      apDelayed = a1[apIdx]!
      apInput = apOut + apDelayed * 0.5
      a1[apIdx] = apInput
      apOut = apDelayed - apInput * 0.5
      state.apIdx1 = (apIdx + 1) % a1.length

      outputs.out[i] = input * dry + apOut * wet
    }
  },
}
