import type { ModuleDefinition } from '../../engine/types'

interface OctaveState {
  [key: string]: unknown
}

export const OctaveDefinition: ModuleDefinition<
  {
    input: { type: 'cv'; default: 0; label: 'in' }
  },
  {
    out: { type: 'cv'; default: 0; label: 'out' }
  },
  {
    shift: { type: 'int'; min: -4; max: 4; default: 0; label: 'oct' }
  },
  OctaveState
> = {
  id: 'octave',
  name: 'octave',
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
    shift: { type: 'int', min: -4, max: 4, default: 0, label: 'oct' },
  },

  initialize(): OctaveState {
    return {}
  },

  process(inputs, outputs, params) {
    const shift = Math.round(params.shift)
    for (let i = 0; i < 128; i++) {
      outputs.out[i] = (inputs.input[i] ?? 0) + shift
    }
  },
}
