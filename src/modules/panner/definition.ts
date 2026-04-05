import type { ModuleDefinition } from '../../engine/types'

interface PannerState {
  [key: string]: unknown
}

export const PannerDefinition: ModuleDefinition<
  {
    in: { type: 'audio'; default: 0; label: 'in' }
    panCv: { type: 'cv'; default: 0; label: 'pan cv' }
  },
  {
    left: { type: 'audio'; default: 0; label: 'left' }
    right: { type: 'audio'; default: 0; label: 'right' }
  },
  {
    pan: { type: 'float'; min: -1; max: 1; default: 0; label: 'pan' }
  },
  PannerState
> = {
  id: 'panner',
  name: 'panner',
  category: 'utility',
  width: 4,
  height: 3,

  inputs: {
    in: { type: 'audio', default: 0, label: 'in' },
    panCv: { type: 'cv', default: 0, label: 'pan cv' },
  },
  outputs: {
    left: { type: 'audio', default: 0, label: 'left' },
    right: { type: 'audio', default: 0, label: 'right' },
  },
  params: {
    pan: { type: 'float', min: -1, max: 1, default: 0, label: 'pan' },
  },

  initialize(): PannerState {
    return {}
  },

  process(inputs, outputs, params, _state, _context) {
    const halfPi = Math.PI / 2

    for (let i = 0; i < 128; i++) {
      const input = inputs.in[i] ?? 0
      const panCv = inputs.panCv[i] ?? 0
      const pan = Math.max(-1, Math.min(1, params.pan + panCv))

      // constant-power panning: angle goes 0 (full L) to π/2 (full R)
      const angle = (pan + 1) * 0.5 * halfPi
      outputs.left[i] = input * Math.cos(angle)
      outputs.right[i] = input * Math.sin(angle)
    }
  },
}
