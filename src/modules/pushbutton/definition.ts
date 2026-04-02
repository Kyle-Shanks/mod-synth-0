import type { ModuleDefinition } from '../../engine/types'

interface GateEvent {
  offset: number
  value: number
  portId: string
}

interface PushButtonState {
  gateHigh: boolean
  triggerSamplesRemaining: number
  _gateEvents: GateEvent[]
  [key: string]: unknown
}

export const PushButtonDefinition: ModuleDefinition<
  Record<string, never>,
  {
    gate: { type: 'gate'; default: 0; label: 'gate' }
    trigger: { type: 'trigger'; default: 0; label: 'trig' }
  },
  Record<string, never>,
  PushButtonState
> = {
  id: 'pushbutton',
  name: 'button',
  category: 'control',
  width: 2,
  height: 3,

  inputs: {},
  outputs: {
    gate:    { type: 'gate',    default: 0, label: 'gate' },
    trigger: { type: 'trigger', default: 0, label: 'trig' },
  },
  params: {},

  initialize(context): PushButtonState {
    void context
    return {
      gateHigh: false,
      triggerSamplesRemaining: 0,
      _gateEvents: [],
    }
  },

  process(_inputs, outputs, _params, state, context) {
    const triggerDuration = Math.round(context.sampleRate * 0.001)  // 1ms pulse
    const events = state._gateEvents as GateEvent[]

    // sort events by offset for correct sample-accurate ordering
    events.sort((a, b) => a.offset - b.offset)

    let eventIdx = 0

    for (let i = 0; i < 128; i++) {
      // process any gate events at this sample offset
      while (eventIdx < events.length && (events[eventIdx]?.offset ?? 0) <= i) {
        const evt = events[eventIdx]!
        if (evt.value > 0) {
          // rising edge
          state.gateHigh = true
          state.triggerSamplesRemaining = triggerDuration
        } else {
          // falling edge
          state.gateHigh = false
        }
        eventIdx++
      }

      // write gate output
      outputs.gate[i] = state.gateHigh ? 1.0 : 0.0

      // write trigger output (1ms pulse on rising edge)
      if (state.triggerSamplesRemaining > 0) {
        outputs.trigger[i] = 1.0
        state.triggerSamplesRemaining--
      } else {
        outputs.trigger[i] = 0.0
      }
    }

    // clear processed events
    state._gateEvents = []
  }
}
