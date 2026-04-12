import type { ModuleDefinition } from '../../engine/types'

interface GateEvent {
  offset: number
  value: number
  portId: string
}

interface SampleHoldState {
  heldValue: number
  manualGateHigh: boolean
  gateWasHigh: boolean
  _connectedInputs: Record<string, boolean>
  _gateEvents: GateEvent[]
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
  width: 2,
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
    return {
      heldValue: 0,
      manualGateHigh: false,
      gateWasHigh: false,
      _connectedInputs: {},
      _gateEvents: [],
    }
  },

  process(inputs, outputs, _params, state) {
    const gateConnected = !!state._connectedInputs.gate
    const events = state._gateEvents
    events.sort((a, b) => a.offset - b.offset)
    let eventIdx = 0

    for (let i = 0; i < 128; i++) {
      while (
        eventIdx < events.length &&
        (events[eventIdx]?.offset ?? 0) <= i
      ) {
        const evt = events[eventIdx]
        if (evt?.portId === 'gate') {
          state.manualGateHigh = evt.value > 0.5
        }
        eventIdx++
      }

      const gateHigh = gateConnected
        ? (inputs.gate[i] ?? 0) > 0.5
        : state.manualGateHigh

      // sample on rising edge
      if (gateHigh && !state.gateWasHigh) {
        state.heldValue = inputs.input[i] ?? 0
      }
      state.gateWasHigh = gateHigh

      outputs.out[i] = state.heldValue
    }

    state._gateEvents = []
  },
}
