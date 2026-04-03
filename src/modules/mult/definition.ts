import type { ModuleDefinition } from '../../engine/types'

interface MultState {
  [key: string]: unknown
}

export const MultDefinition: ModuleDefinition<
  {
    in: { type: 'cv'; default: 0; label: 'in' }
  },
  {
    a: { type: 'cv'; default: 0; label: 'a' }
    b: { type: 'cv'; default: 0; label: 'b' }
    c: { type: 'cv'; default: 0; label: 'c' }
    d: { type: 'cv'; default: 0; label: 'd' }
  },
  Record<string, never>,
  MultState
> = {
  id: 'mult',
  name: 'mult',
  category: 'utility',
  width: 2,
  height: 3,

  inputs: {
    in: { type: 'cv', default: 0, label: 'in' },
  },
  outputs: {
    a: { type: 'cv', default: 0, label: 'a' },
    b: { type: 'cv', default: 0, label: 'b' },
    c: { type: 'cv', default: 0, label: 'c' },
    d: { type: 'cv', default: 0, label: 'd' },
  },
  params: {},

  initialize(): MultState {
    return {}
  },

  process(inputs, outputs) {
    for (let i = 0; i < 128; i++) {
      const v = inputs.in[i] ?? 0
      outputs.a[i] = v
      outputs.b[i] = v
      outputs.c[i] = v
      outputs.d[i] = v
    }
  },
}
