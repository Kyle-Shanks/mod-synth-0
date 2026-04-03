import type { ModuleDefinition } from '../../engine/types'

interface WavefolderState {
  [key: string]: unknown
}

export const WavefolderDefinition: ModuleDefinition<
  {
    in:     { type: 'audio'; default: 0; label: 'in' }
    foldCv: { type: 'cv';    default: 0; label: 'fold' }
  },
  {
    out: { type: 'audio'; default: 0; label: 'out' }
  },
  {
    gain:     { type: 'float'; min: 1; max: 8; default: 2; label: 'gain' }
    symmetry: { type: 'float'; min: -1; max: 1; default: 0; label: 'sym' }
  },
  WavefolderState
> = {
  id: 'wavefolder',
  name: 'wfold',
  category: 'fx',
  width: 2,
  height: 3,

  inputs: {
    in:     { type: 'audio', default: 0, label: 'in' },
    foldCv: { type: 'cv',    default: 0, label: 'fold' },
  },
  outputs: {
    out: { type: 'audio', default: 0, label: 'out' },
  },
  params: {
    gain:     { type: 'float', min: 1, max: 8, default: 2, label: 'gain' },
    symmetry: { type: 'float', min: -1, max: 1, default: 0, label: 'sym' },
  },

  initialize(): WavefolderState {
    return {}
  },

  process(inputs, outputs, params) {
    function fold(x: number): number {
      const v = (x + 1) * 0.5
      const t = v - Math.floor(v)
      const f = t < 0.5 ? 2 * t : 2 * (1 - t)
      return f * 2 - 1
    }
    for (let i = 0; i < 128; i++) {
      const gain = Math.max(1, params.gain + (inputs.foldCv[i] ?? 0) * 4)
      outputs.out[i] = fold((inputs.in[i] ?? 0) * gain + params.symmetry)
    }
  },
}
