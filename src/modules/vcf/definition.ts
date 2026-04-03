import type { ModuleDefinition } from '../../engine/types'

interface VCFState {
  z1: number // first delay element
  z2: number // second delay element
  [key: string]: unknown
}

export const VCFDefinition: ModuleDefinition<
  {
    audio: { type: 'audio'; default: 0; label: 'in' }
    cutoffCv: { type: 'cv'; default: 0; label: 'cut cv' }
    resonanceCv: { type: 'cv'; default: 0; label: 'res cv' }
    envelope: { type: 'cv'; default: 0; label: 'env' }
  },
  { out: { type: 'audio'; default: 0; label: 'out' } },
  {
    cutoff: {
      type: 'float'
      min: 20
      max: 20000
      default: 1000
      label: 'cutoff'
      unit: 'hz'
    }
    resonance: { type: 'float'; min: 0; max: 1; default: 0; label: 'res' }
    mode: {
      type: 'select'
      default: 0
      label: 'mode'
      options: ['lowpass', 'highpass', 'bandpass']
    }
    envAmount: {
      type: 'float'
      min: -1
      max: 1
      default: 0.5
      label: 'env'
      unit: ''
    }
  },
  VCFState
> = {
  id: 'vcf',
  name: 'vcf',
  category: 'filter',
  width: 3,
  height: 5,

  inputs: {
    audio: { type: 'audio', default: 0, label: 'in' },
    cutoffCv: { type: 'cv', default: 0, label: 'cut cv' },
    resonanceCv: { type: 'cv', default: 0, label: 'res cv' },
    envelope: { type: 'cv', default: 0, label: 'env' },
  },
  outputs: {
    out: { type: 'audio', default: 0, label: 'out' },
  },
  params: {
    cutoff: {
      type: 'float',
      min: 20,
      max: 20000,
      default: 1000,
      label: 'cutoff',
      unit: 'hz',
      curve: 'log',
    },
    resonance: { type: 'float', min: 0, max: 1, default: 0, label: 'res' },
    envAmount: {
      type: 'float',
      min: -1,
      max: 1,
      default: 0.5,
      label: 'env',
      unit: '',
    },
    mode: {
      type: 'select',
      default: 0,
      label: 'mode',
      options: ['lowpass', 'highpass', 'bandpass'],
    },
  },

  initialize(): VCFState {
    return { z1: 0, z2: 0 }
  },

  process(inputs, outputs, params, state, context) {
    const sampleRate = context.sampleRate
    const mode = params.mode // 0=lp, 1=hp, 2=bp

    for (let i = 0; i < 128; i++) {
      const input = inputs.audio[i] ?? 0
      const envCv = inputs.envelope[i] ?? 0
      const cutoffCv = inputs.cutoffCv[i] ?? 0

      // modulate cutoff: env amount scales the envelope CV, cutoffCv adds directly
      const modCutoff =
        params.cutoff * Math.pow(2, (envCv * params.envAmount + cutoffCv) * 4)
      const clampedCutoff = Math.max(20, Math.min(sampleRate * 0.49, modCutoff))

      const resCv = inputs.resonanceCv[i] ?? 0
      const res = Math.max(0, Math.min(1, params.resonance + resCv))

      // ZDF (zero-delay feedback) SVF — unconditionally stable (Cytomic/Simper topology)
      const g = Math.tan((Math.PI * clampedCutoff) / sampleRate)
      const k = 2 - 2 * res // damping: 2 = no resonance, 0 = self-oscillation
      const a1 = 1 / (1 + g * (g + k))
      const a2 = g * a1
      const a3 = g * a2

      const v3 = input - state.z2
      const v1 = a1 * state.z1 + a2 * v3
      const v2 = state.z2 + a2 * state.z1 + a3 * v3

      state.z1 = 2 * v1 - state.z1
      state.z2 = 2 * v2 - state.z2

      // select output based on mode
      if (mode < 0.5) {
        outputs.out[i] = v2 // lowpass
      } else if (mode < 1.5) {
        outputs.out[i] = input - k * v1 - v2 // highpass
      } else {
        outputs.out[i] = v1 // bandpass
      }
    }
  },
}
