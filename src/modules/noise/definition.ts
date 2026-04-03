import type { ModuleDefinition } from '../../engine/types'

interface NoiseState {
  // pink noise filter state (Paul Kellet's approximation)
  b0: number
  b1: number
  b2: number
  b3: number
  b4: number
  b5: number
  b6: number
  [key: string]: unknown
}

export const NoiseDefinition: ModuleDefinition<
  Record<string, never>,
  {
    white: { type: 'audio'; default: 0; label: 'wht' }
    pink: { type: 'audio'; default: 0; label: 'pnk' }
  },
  {
    level: { type: 'float'; min: 0; max: 1; default: 1; label: 'level' }
  },
  NoiseState
> = {
  id: 'noise',
  name: 'noise',
  category: 'source',
  width: 3,
  height: 3,

  inputs: {},
  outputs: {
    white: { type: 'audio', default: 0, label: 'wht' },
    pink: { type: 'audio', default: 0, label: 'pnk' },
  },
  params: {
    level: { type: 'float', min: 0, max: 1, default: 1, label: 'level' },
  },

  initialize(): NoiseState {
    return { b0: 0, b1: 0, b2: 0, b3: 0, b4: 0, b5: 0, b6: 0 }
  },

  process(_inputs, outputs, params, state) {
    const level = params.level

    for (let i = 0; i < 128; i++) {
      // white noise: uniform random [-1, 1]
      const white = Math.random() * 2 - 1

      outputs.white[i] = white * level

      // pink noise: Paul Kellet's economy method
      // approximates -3dB/octave rolloff
      state.b0 = 0.99886 * state.b0 + white * 0.0555179
      state.b1 = 0.99332 * state.b1 + white * 0.0750759
      state.b2 = 0.96900 * state.b2 + white * 0.1538520
      state.b3 = 0.86650 * state.b3 + white * 0.3104856
      state.b4 = 0.55000 * state.b4 + white * 0.5329522
      state.b5 = -0.7616 * state.b5 - white * 0.0168980
      const pink =
        (state.b0 + state.b1 + state.b2 + state.b3 + state.b4 + state.b5 + state.b6 + white * 0.5362) * 0.11
      state.b6 = white * 0.115926

      outputs.pink[i] = pink * level
    }
  },
}
