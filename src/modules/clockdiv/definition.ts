import type { ModuleDefinition } from '../../engine/types'

interface ClockDivState {
  clockWasHigh: boolean
  divCounter: number
  indicatorTimer: number
  [key: string]: unknown
}

export const ClockDivDefinition: ModuleDefinition<
  {
    clock: { type: 'gate'; default: 0; label: 'clock' }
    reset: { type: 'trigger'; default: 0; label: 'reset' }
  },
  {
    out: { type: 'gate'; default: 0; label: 'out' }
  },
  {
    div: {
      type: 'int'
      min: 2
      max: 10
      default: 4
      label: 'div'
    }
  },
  ClockDivState
> = {
  id: 'clockdiv',
  name: 'clock div',
  category: 'control',
  width: 3,
  height: 3,

  inputs: {
    clock: { type: 'gate', default: 0, label: 'clock' },
    reset: { type: 'trigger', default: 0, label: 'reset' },
  },
  outputs: {
    out: { type: 'gate', default: 0, label: 'out' },
  },
  params: {
    div: {
      type: 'int',
      min: 2,
      max: 10,
      default: 4,
      label: 'div',
    },
  },

  initialize(): ClockDivState {
    return {
      clockWasHigh: false,
      divCounter: 0,
      indicatorTimer: 0,
    }
  },

  process(inputs, outputs, params, state, context) {
    const div = Math.max(2, Math.min(10, Math.round(params.div)))
    const indicatorDuration = Math.max(1, Math.round(context.sampleRate * 0.03))

    for (let i = 0; i < 128; i++) {
      const clockHigh = (inputs.clock[i] ?? 0) > 0.5
      const resetHigh = (inputs.reset[i] ?? 0) > 0.5
      const risingEdge = clockHigh && !(state.clockWasHigh as boolean)

      // reset on trigger
      if (resetHigh) {
        state.divCounter = 0
      }

      if (risingEdge) {
        state.divCounter = ((state.divCounter as number) + 1) % div
      }
      const outHigh = (state.divCounter as number) === 0 && clockHigh
      outputs.out[i] = outHigh ? 1 : 0
      if (outHigh) {
        state.indicatorTimer = indicatorDuration
      } else if ((state.indicatorTimer as number) > 0) {
        state.indicatorTimer = (state.indicatorTimer as number) - 1
      }

      state.clockWasHigh = clockHigh
    }

    // write indicator state for UI lights
    const indBuf = state._indicatorBuffer as Int32Array | undefined
    if (indBuf) {
      Atomics.store(indBuf, 0, (state.indicatorTimer as number) > 0 ? 1 : 0)
      Atomics.store(indBuf, 1, 0)
    }
  },
}
