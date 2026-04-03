import type { ModuleDefinition } from '../../engine/types'

interface BitcrusherState {
  held: number
  holdCounter: number
  [key: string]: unknown
}

export const BitcrusherDefinition: ModuleDefinition<
  {
    in: { type: 'audio'; default: 0; label: 'in' }
  },
  {
    out: { type: 'audio'; default: 0; label: 'out' }
  },
  {
    bits: { type: 'int'; min: 1; max: 16; default: 8; label: 'bits' }
    rate: { type: 'float'; min: 0.01; max: 1; default: 1; label: 'rate' }
  },
  BitcrusherState
> = {
  id: 'bitcrusher',
  name: 'crush',
  category: 'fx',
  width: 2,
  height: 3,

  inputs: {
    in: { type: 'audio', default: 0, label: 'in' },
  },
  outputs: {
    out: { type: 'audio', default: 0, label: 'out' },
  },
  params: {
    bits: { type: 'int', min: 1, max: 16, default: 8, label: 'bits' },
    rate: { type: 'float', min: 0.01, max: 1, default: 1, label: 'rate' },
  },

  initialize(): BitcrusherState {
    return { held: 0, holdCounter: 0 }
  },

  process(inputs, outputs, params, state) {
    const levels = Math.pow(2, Math.round(params.bits))
    const holdSamples = Math.max(1, Math.round(1 / params.rate))
    for (let i = 0; i < 128; i++) {
      state.holdCounter = (state.holdCounter as number) + 1
      if ((state.holdCounter as number) >= holdSamples) {
        state.holdCounter = 0
        const raw = inputs.in[i] ?? 0
        const quantized = Math.round((raw + 1) * 0.5 * (levels - 1))
        state.held = (quantized / (levels - 1)) * 2 - 1
      }
      outputs.out[i] = state.held as number
    }
  },
}
