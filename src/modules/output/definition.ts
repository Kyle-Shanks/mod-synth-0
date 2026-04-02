import type { ModuleDefinition } from '../../engine/types'

export const OutputDefinition: ModuleDefinition = {
  id: 'output',
  name: 'output',
  category: 'utility',
  width: 2,
  height: 3,

  inputs: {
    left:   { type: 'audio', default: 0, label: 'l' },
    right:  { type: 'audio', default: 0, label: 'r' },
  },
  outputs: {},
  params: {
    gain: { type: 'float', min: 0, max: 1, default: 0.8, label: 'vol' },
  },

  initialize() { return {} },

  process(inputs, _outputs, params, state) {
    // the output module stores processed audio in state for the worklet to read
    // allocate on first call, reuse after
    if (!state['_outputLeft']) state['_outputLeft'] = new Float32Array(128)
    if (!state['_outputRight']) state['_outputRight'] = new Float32Array(128)
    const leftOut = state['_outputLeft'] as Float32Array
    const rightOut = state['_outputRight'] as Float32Array

    const gain = params.gain ?? 0.8
    for (let i = 0; i < 128; i++) {
      const left = (inputs.left?.[i] ?? 0) * gain
      const right = (inputs.right?.[i] ?? inputs.left?.[i] ?? 0) * gain
      leftOut[i] = left
      rightOut[i] = right
    }
  }
}
