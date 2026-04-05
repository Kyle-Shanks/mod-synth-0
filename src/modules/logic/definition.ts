import type { ModuleDefinition } from '../../engine/types'

interface LogicState {
  [key: string]: unknown
}

export const LogicDefinition: ModuleDefinition<
  {
    a: { type: 'gate'; default: 0; label: 'a' }
    b: { type: 'gate'; default: 0; label: 'b' }
  },
  {
    out: { type: 'gate'; default: 0; label: 'out' }
  },
  {
    mode: {
      type: 'select'
      default: 0
      options: ['and', 'or', 'xor', 'not']
      label: 'mode'
    }
  },
  LogicState
> = {
  id: 'logic',
  name: 'logic',
  category: 'utility',
  width: 2,
  height: 4,

  inputs: {
    a: { type: 'gate', default: 0, label: 'a' },
    b: { type: 'gate', default: 0, label: 'b' },
  },
  outputs: {
    out: { type: 'gate', default: 0, label: 'out' },
  },
  params: {
    mode: {
      type: 'select',
      default: 0,
      options: ['and', 'or', 'xor', 'not'],
      label: 'mode',
    },
  },

  initialize(): LogicState {
    return {}
  },

  process(inputs, outputs, params) {
    const mode = Math.round(params.mode)
    for (let i = 0; i < 128; i++) {
      const av = (inputs.a[i] ?? 0) > 0.5 ? 1 : 0
      const bv = (inputs.b[i] ?? 0) > 0.5 ? 1 : 0
      let result = 0
      if (mode === 0) result = av & bv
      else if (mode === 1) result = av | bv
      else if (mode === 2) result = av ^ bv
      // NOT mode should work with either input jack; treat A/B as a combined source.
      else if (mode === 3) result = 1 - (av | bv)
      outputs.out[i] = result
    }
  },
}
