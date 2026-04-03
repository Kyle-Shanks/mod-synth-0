import type { ModuleDefinition } from '../../engine/types'

interface SlewState {
  value: number
  [key: string]: unknown
}

export const SlewDefinition: ModuleDefinition<
  {
    in: { type: 'cv'; default: 0; label: 'in' }
  },
  {
    out: { type: 'cv'; default: 0; label: 'out' }
  },
  {
    rise: { type: 'float'; min: 0; max: 1; default: 0.01; label: 'rise'; unit: 's' }
    fall: { type: 'float'; min: 0; max: 1; default: 0.01; label: 'fall'; unit: 's' }
  },
  SlewState
> = {
  id: 'slew',
  name: 'slew',
  category: 'utility',
  width: 2,
  height: 3,

  inputs: {
    in: { type: 'cv', default: 0, label: 'in' },
  },
  outputs: {
    out: { type: 'cv', default: 0, label: 'out' },
  },
  params: {
    rise: { type: 'float', min: 0, max: 1, default: 0.01, label: 'rise', unit: 's' },
    fall: { type: 'float', min: 0, max: 1, default: 0.01, label: 'fall', unit: 's' },
  },

  initialize(): SlewState {
    return { value: 0 }
  },

  process(inputs, outputs, params, state, context) {
    const riseCoeff = 1 - Math.exp(-1 / Math.max(1, params.rise * context.sampleRate))
    const fallCoeff = 1 - Math.exp(-1 / Math.max(1, params.fall * context.sampleRate))
    for (let i = 0; i < 128; i++) {
      const target = inputs.in[i] ?? 0
      const diff = target - state.value
      state.value += diff * (diff > 0 ? riseCoeff : fallCoeff)
      outputs.out[i] = state.value
    }
  },
}
