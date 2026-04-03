import type { ModuleDefinition } from '../../engine/types'

interface MixerState {
  [key: string]: unknown
}

export const MixerDefinition: ModuleDefinition<
  {
    in1: { type: 'audio'; default: 0; label: 'in 1' }
    in2: { type: 'audio'; default: 0; label: 'in 2' }
    in3: { type: 'audio'; default: 0; label: 'in 3' }
    in4: { type: 'audio'; default: 0; label: 'in 4' }
  },
  { out: { type: 'audio'; default: 0; label: 'out' } },
  {
    level1: { type: 'float'; min: 0; max: 1; default: 0.8; label: 'lv 1' }
    level2: { type: 'float'; min: 0; max: 1; default: 0.8; label: 'lv 2' }
    level3: { type: 'float'; min: 0; max: 1; default: 0.8; label: 'lv 3' }
    level4: { type: 'float'; min: 0; max: 1; default: 0.8; label: 'lv 4' }
    master: { type: 'float'; min: 0; max: 1; default: 1; label: 'mstr' }
  },
  MixerState
> = {
  id: 'mixer',
  name: 'mixer',
  category: 'utility',
  width: 4,
  height: 3,

  inputs: {
    in1: { type: 'audio', default: 0, label: 'in 1' },
    in2: { type: 'audio', default: 0, label: 'in 2' },
    in3: { type: 'audio', default: 0, label: 'in 3' },
    in4: { type: 'audio', default: 0, label: 'in 4' },
  },
  outputs: {
    out: { type: 'audio', default: 0, label: 'out' },
  },
  params: {
    level1: { type: 'float', min: 0, max: 1, default: 0.8, label: 'lv 1' },
    level2: { type: 'float', min: 0, max: 1, default: 0.8, label: 'lv 2' },
    level3: { type: 'float', min: 0, max: 1, default: 0.8, label: 'lv 3' },
    level4: { type: 'float', min: 0, max: 1, default: 0.8, label: 'lv 4' },
    master: { type: 'float', min: 0, max: 1, default: 1, label: 'mstr' },
  },

  initialize(): MixerState {
    return {}
  },

  process(inputs, outputs, params) {
    for (let i = 0; i < 128; i++) {
      const sum =
        (inputs.in1[i] ?? 0) * params.level1 +
        (inputs.in2[i] ?? 0) * params.level2 +
        (inputs.in3[i] ?? 0) * params.level3 +
        (inputs.in4[i] ?? 0) * params.level4
      outputs.out[i] = sum * params.master
    }
  },
}
