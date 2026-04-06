import type { ModuleDefinition } from '../../engine/types'

interface VCAState {
  _meters: Record<string, number>
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
  width: 2,
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
    return { _meters: { out: 0 } }
  },

  process(inputs, outputs, params, state) {
    let peak = 0

    for (let i = 0; i < 128; i++) {
      // if cv is connected (non-zero), use it; otherwise use gain param
      const cvVal = inputs.cv[i] ?? 0
      const cv = cvVal !== 0 ? Math.max(0, cvVal) : params.gain
      const out = (inputs.audio[i] ?? 0) * cv
      outputs.out[i] = out

      const abs = Math.abs(out)
      if (abs > peak) peak = abs
    }

    ;(state._meters as Record<string, number>).out = Math.min(1, peak)
  },
}
