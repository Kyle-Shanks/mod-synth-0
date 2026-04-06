import type { ModuleDefinition } from '../../engine/types'

interface ClockDivState {
  clockWasHigh: boolean
  divCounter: number
  mulPhase: number
  mulSamplesPerBeat: number
  samplesSinceRising: number
  [key: string]: unknown
}

export const ClockDivDefinition: ModuleDefinition<
  {
    clock: { type: 'gate'; default: 0; label: 'clk' }
    reset: { type: 'trigger'; default: 0; label: 'rst' }
  },
  {
    out: { type: 'gate'; default: 0; label: 'out' }
  },
  {
    ratio: {
      type: 'select'
      default: 3
      options: [
        '/8',
        '/6',
        '/5',
        '/4',
        '/3',
        '/2',
        '×2',
        '×3',
        '×4',
        '×6',
        '×8',
      ]
      label: 'ratio'
    }
  },
  ClockDivState
> = {
  id: 'clockdiv',
  name: 'clock div',
  category: 'control',
  width: 3,
  height: 4,

  inputs: {
    clock: { type: 'gate', default: 0, label: 'clk' },
    reset: { type: 'trigger', default: 0, label: 'rst' },
  },
  outputs: {
    out: { type: 'gate', default: 0, label: 'out' },
  },
  params: {
    ratio: {
      type: 'select',
      default: 3,
      options: [
        '/8',
        '/6',
        '/5',
        '/4',
        '/3',
        '/2',
        '×2',
        '×3',
        '×4',
        '×6',
        '×8',
      ],
      label: 'ratio',
    },
  },

  initialize(): ClockDivState {
    return {
      clockWasHigh: false,
      divCounter: 0,
      mulPhase: 0,
      mulSamplesPerBeat: 22050,
      samplesSinceRising: 0,
    }
  },

  process(inputs, outputs, params, state) {
    // ratioTable: positive = divide, negative = multiply
    const ratioTable = [8, 6, 5, 4, 3, 2, -2, -3, -4, -6, -8]
    const ratioIdx = Math.max(
      0,
      Math.min(ratioTable.length - 1, Math.round(params.ratio)),
    )
    const ratio = ratioTable[ratioIdx] ?? 2

    for (let i = 0; i < 128; i++) {
      const clockHigh = (inputs.clock[i] ?? 0) > 0.5
      const resetHigh = (inputs.reset[i] ?? 0) > 0.5
      const risingEdge = clockHigh && !(state.clockWasHigh as boolean)

      // reset on trigger
      if (resetHigh) {
        state.divCounter = 0
        state.mulPhase = 0
        state.samplesSinceRising = 0
      }

      if (ratio > 0) {
        // divide mode
        if (risingEdge) {
          state.divCounter = ((state.divCounter as number) + 1) % ratio
        }
        outputs.out[i] = (state.divCounter as number) === 0 && clockHigh ? 1 : 0
      } else {
        // multiply mode
        const mul = -ratio
        state.samplesSinceRising = (state.samplesSinceRising as number) + 1
        if (risingEdge) {
          state.mulSamplesPerBeat = Math.max(
            1,
            state.samplesSinceRising as number,
          )
          state.samplesSinceRising = 0
          state.mulPhase = 0
        }
        state.mulPhase =
          ((state.mulPhase as number) +
            mul / (state.mulSamplesPerBeat as number)) %
          1
        outputs.out[i] = (state.mulPhase as number) < 0.5 ? 1 : 0
      }

      state.clockWasHigh = clockHigh
    }
  },
}
