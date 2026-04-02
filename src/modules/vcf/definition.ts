import type { ModuleDefinition } from '../../engine/types'

interface VCFState {
  z1: number  // first delay element
  z2: number  // second delay element
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
    cutoff: { type: 'float'; min: 20; max: 20000; default: 1000; label: 'cutoff'; unit: 'hz' }
    resonance: { type: 'float'; min: 0; max: 1; default: 0; label: 'res' }
    mode: { type: 'select'; default: 0; label: 'mode'; options: ['lowpass', 'highpass', 'bandpass'] }
    envAmount: { type: 'float'; min: -1; max: 1; default: 0.5; label: 'env'; unit: '' }
  },
  VCFState
> = {
  id: 'vcf',
  name: 'vcf',
  category: 'filter',
  width: 3,
  height: 6,

  inputs: {
    audio:       { type: 'audio', default: 0, label: 'in' },
    cutoffCv:    { type: 'cv',    default: 0, label: 'cut cv' },
    resonanceCv: { type: 'cv',    default: 0, label: 'res cv' },
    envelope:    { type: 'cv',    default: 0, label: 'env' },
  },
  outputs: {
    out: { type: 'audio', default: 0, label: 'out' },
  },
  params: {
    cutoff:    { type: 'float',  min: 20,  max: 20000, default: 1000, label: 'cutoff', unit: 'hz' },
    resonance: { type: 'float',  min: 0,   max: 1,     default: 0,    label: 'res' },
    mode:      { type: 'select', default: 0, label: 'mode', options: ['lowpass', 'highpass', 'bandpass'] },
    envAmount: { type: 'float',  min: -1,  max: 1,     default: 0.5,  label: 'env', unit: '' },
  },

  initialize(): VCFState {
    return { z1: 0, z2: 0 }
  },

  process(inputs, outputs, params, state, context) {
    const sampleRate = context.sampleRate
    const mode = params.mode  // 0=lp, 1=hp, 2=bp

    for (let i = 0; i < 128; i++) {
      const input = inputs.audio[i] ?? 0
      const envCv = inputs.envelope[i] ?? 0
      const cutoffCv = inputs.cutoffCv[i] ?? 0

      // modulate cutoff: env amount scales the envelope CV, cutoffCv adds directly
      const modCutoff = params.cutoff * Math.pow(2, (envCv * params.envAmount + cutoffCv) * 4)
      const clampedCutoff = Math.max(20, Math.min(sampleRate * 0.45, modCutoff))

      const resCv = inputs.resonanceCv[i] ?? 0
      const res = Math.max(0, Math.min(1, params.resonance + resCv))

      // state variable filter
      const f = 2 * Math.sin(Math.PI * clampedCutoff / sampleRate)
      const q = 1 - res

      const low = state.z2 + f * state.z1
      const high = input - low - q * state.z1
      const band = f * high + state.z1

      state.z1 = band
      state.z2 = low

      // select output based on mode
      if (mode < 0.5) {
        outputs.out[i] = low
      } else if (mode < 1.5) {
        outputs.out[i] = high
      } else {
        outputs.out[i] = band
      }
    }
  }
}
