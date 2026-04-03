import type { ModuleDefinition } from '../../engine/types'

interface RingModState {
  [key: string]: unknown
}

export const RingModDefinition: ModuleDefinition<
  {
    a: { type: 'audio'; default: 0; label: 'a' }
    b: { type: 'audio'; default: 0; label: 'b' }
  },
  {
    out: { type: 'audio'; default: 0; label: 'out' }
  },
  {
    mix: { type: 'float'; min: 0; max: 1; default: 1; label: 'mix' }
  },
  RingModState
> = {
  id: 'ringmod',
  name: 'ring mod',
  category: 'fx',
  width: 2,
  height: 3,

  inputs: {
    a: { type: 'audio', default: 0, label: 'a' },
    b: { type: 'audio', default: 0, label: 'b' },
  },
  outputs: {
    out: { type: 'audio', default: 0, label: 'out' },
  },
  params: {
    mix: { type: 'float', min: 0, max: 1, default: 1, label: 'mix' },
  },

  initialize(): RingModState {
    return {}
  },

  process(inputs, outputs, params) {
    const mix = params.mix
    for (let i = 0; i < 128; i++) {
      const a = inputs.a[i] ?? 0
      const b = inputs.b[i] ?? 0
      outputs.out[i] = a * (1 - mix) + (a * b) * mix
    }
  },
}
