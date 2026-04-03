import type { ModuleDefinition } from '../../engine/types'

interface SampleHoldState {
  heldValue: number
  gateWasHigh: boolean
  [key: string]: unknown
}

export const SampleHoldDefinition: ModuleDefinition<
  {
    input: { type: 'cv'; default: 0; label: 'in' }
    gate: { type: 'gate'; default: 0; label: 'gate' }
  },
  {
    out: { type: 'cv'; default: 0; label: 'out' }
  },
  Record<string, never>,
  SampleHoldState
> = {
  id: 'samplehold',
  name: 's&h',
  category: 'utility',
  width: 3,
  height: 3,

  inputs: {
    input: { type: 'cv', default: 0, label: 'in' },
    gate: { type: 'gate', default: 0, label: 'gate' },
  },
  outputs: {
    out: { type: 'cv', default: 0, label: 'out' },
  },
  params: {},

  initialize(): SampleHoldState {
    return { heldValue: 0, gateWasHigh: false }
  },

  process(inputs, outputs, _params, state) {
    for (let i = 0; i < 128; i++) {
      const gateValue = inputs.gate[i] ?? 0
      const gateHigh = gateValue > 0.5

      // sample on rising edge
      if (gateHigh && !state.gateWasHigh) {
        state.heldValue = inputs.input[i] ?? 0
      }
      state.gateWasHigh = gateHigh

      outputs.out[i] = state.heldValue
    }
  },
}
