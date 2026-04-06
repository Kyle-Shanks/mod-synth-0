import type { ModuleDefinition } from '../../engine/types'

interface CVState {
  [key: string]: unknown
}

export const CVDefinition: ModuleDefinition<
  Record<string, never>,
  {
    out: { type: 'cv'; default: 0; label: 'out' }
  },
  {
    value: { type: 'float'; min: -1; max: 1; default: 0; label: 'cv' }
  },
  CVState
> = {
  id: 'cv',
  name: 'cv',
  category: 'control',
  width: 2,
  height: 3,

  inputs: {},
  outputs: {
    out: { type: 'cv', default: 0, label: 'out' },
  },
  params: {
    value: { type: 'float', min: -1, max: 1, default: 0, label: 'cv' },
  },

  initialize(): CVState {
    return {}
  },

  process(_inputs, outputs, params) {
    outputs.out.fill(params.value)
  },
}
