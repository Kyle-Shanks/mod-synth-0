import type { ModuleDefinition } from '../../engine/types'

interface OutputState {
  _outputLeft: Float32Array | null
  _outputRight: Float32Array | null
  peakL: number
  peakR: number
  peakDecay: number
  [key: string]: unknown
}

export const OutputDefinition: ModuleDefinition<
  {
    left: { type: 'audio'; default: 0; label: 'l' }
    right: { type: 'audio'; default: 0; label: 'r' }
  },
  Record<string, never>,
  {
    gain: { type: 'float'; min: 0; max: 1; default: 0.8; label: 'vol' }
  },
  OutputState
> = {
  id: 'output',
  name: 'output',
  category: 'utility',
  width: 3,
  height: 5,

  inputs: {
    left: { type: 'audio', default: 0, label: 'l' },
    right: { type: 'audio', default: 0, label: 'r' },
  },
  outputs: {},
  params: {
    gain: { type: 'float', min: 0, max: 1, default: 0.8, label: 'vol' },
  },

  initialize(): OutputState {
    return {
      _outputLeft: null,
      _outputRight: null,
      peakL: 0,
      peakR: 0,
      peakDecay: 0,
    }
  },

  process(inputs, _outputs, params, state, context) {
    // allocate on first call, reuse after
    if (!state._outputLeft) state._outputLeft = new Float32Array(128)
    if (!state._outputRight) state._outputRight = new Float32Array(128)
    const leftOut = state._outputLeft as Float32Array
    const rightOut = state._outputRight as Float32Array

    const gain = params.gain ?? 0.8

    // peak decay coefficient: ~300ms to fall from 1 to ~0
    const decayCoeff = 1 - (1 / (0.3 * context.sampleRate / 128))
    let peakL = (state.peakL as number) * decayCoeff
    let peakR = (state.peakR as number) * decayCoeff

    for (let i = 0; i < 128; i++) {
      const left = (inputs.left?.[i] ?? 0) * gain
      const right = (inputs.right?.[i] ?? inputs.left?.[i] ?? 0) * gain

      // soft clip to prevent harsh digital distortion
      leftOut[i] = Math.tanh(left)
      rightOut[i] = Math.tanh(right)

      // track peak levels
      const absL = Math.abs(leftOut[i]!)
      const absR = Math.abs(rightOut[i]!)
      if (absL > peakL) peakL = absL
      if (absR > peakR) peakR = absR
    }

    state.peakL = peakL
    state.peakR = peakR
  },
}
