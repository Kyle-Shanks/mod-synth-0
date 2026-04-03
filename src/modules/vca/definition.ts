import type { ModuleDefinition } from '../../engine/types'

interface VCAState {
  [key: string]: unknown
}

export const VCADefinition: ModuleDefinition<
  {
    audio: { type: 'audio'; default: 0; label: 'in' }
    cv: { type: 'cv'; default: 0; label: 'cv' }
  },
  { out: { type: 'audio'; default: 0; label: 'out' } },
  { gain: { type: 'float'; min: 0; max: 1; default: 1; label: 'gain' } },
  VCAState
> = {
  id: 'vca',
  name: 'vca',
  category: 'dynamics',
  // width: 2,
  width: 3,
  height: 3,

  inputs: {
    audio: { type: 'audio', default: 0, label: 'in' },
    cv: { type: 'cv', default: 0, label: 'cv' },
  },
  outputs: {
    out: { type: 'audio', default: 0, label: 'out' },
  },
  params: {
    gain: { type: 'float', min: 0, max: 1, default: 1, label: 'gain' },
  },

  initialize(): VCAState {
    return {}
  },

  process(inputs, outputs, params) {
    for (let i = 0; i < 128; i++) {
      // if cv is connected (non-zero), use it; otherwise use gain param
      const cvVal = inputs.cv[i] ?? 0
      const cv = cvVal !== 0 ? Math.max(0, cvVal) : params.gain
      outputs.out[i] = (inputs.audio[i] ?? 0) * cv
    }
  },
}
