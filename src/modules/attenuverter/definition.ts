import type { ModuleDefinition } from '../../engine/types'

interface AttenuverterState {
  [key: string]: unknown
}

export const AttenuverterDefinition: ModuleDefinition<
  {
    input: { type: 'cv'; default: 0; label: 'in' }
  },
  {
    out: { type: 'cv'; default: 0; label: 'out' }
  },
  {
    amount: {
      type: 'float'
      min: -2
      max: 2
      default: 1
      label: 'amt'
    }
    offset: {
      type: 'float'
      min: -5
      max: 5
      default: 0
      label: 'ofs'
    }
  },
  AttenuverterState
> = {
  id: 'attenuverter',
  name: 'atten',
  category: 'utility',
  width: 2,
  height: 3,

  inputs: {
    input: { type: 'cv', default: 0, label: 'in' },
  },
  outputs: {
    out: { type: 'cv', default: 0, label: 'out' },
  },
  params: {
    amount: {
      type: 'float',
      min: -2,
      max: 2,
      default: 1,
      label: 'amt',
    },
    offset: {
      type: 'float',
      min: -5,
      max: 5,
      default: 0,
      label: 'ofs',
    },
  },

  initialize(): AttenuverterState {
    return {}
  },

  process(inputs, outputs, params) {
    for (let i = 0; i < 128; i++) {
      outputs.out[i] = (inputs.input[i] ?? 0) * params.amount + params.offset
    }
  },
}
