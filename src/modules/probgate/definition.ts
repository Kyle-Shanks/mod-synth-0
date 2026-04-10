import type { ModuleDefinition } from '../../engine/types'

interface ProbGateState {
  wasHigh: boolean
  passing: boolean
  rejectTimer: number
  [key: string]: unknown
}

export const ProbGateDefinition: ModuleDefinition<
  {
    in: { type: 'gate'; default: 0; label: 'in' }
  },
  {
    out: { type: 'gate'; default: 0; label: 'out' }
    reject: { type: 'gate'; default: 0; label: 'skip' }
  },
  {
    prob: { type: 'float'; min: 0; max: 1; default: 0.75; label: 'prob' }
  },
  ProbGateState
> = {
  id: 'probgate',
  name: 'prob gate',
  category: 'utility',
  width: 2,
  height: 3,

  inputs: {
    in: { type: 'gate', default: 0, label: 'in' },
  },
  outputs: {
    out: { type: 'gate', default: 0, label: 'out' },
    reject: { type: 'gate', default: 0, label: 'skip' },
  },
  params: {
    prob: { type: 'float', min: 0, max: 1, default: 0.75, label: 'prob' },
  },

  initialize(): ProbGateState {
    return { wasHigh: false, passing: false, rejectTimer: 0 }
  },

  process(inputs, outputs, params, state, context) {
    const trigDuration = Math.round(context.sampleRate * 0.004) // 4ms pulse for reject

    for (let i = 0; i < 128; i++) {
      const gateIn = (inputs.in[i] ?? 0) > 0.5

      // rising edge: roll dice
      if (gateIn && !(state.wasHigh as boolean)) {
        if (Math.random() < params.prob) {
          state.passing = true
        } else {
          state.passing = false
          state.rejectTimer = trigDuration
        }
      }

      // falling edge: clear pass state
      if (!gateIn && (state.wasHigh as boolean)) {
        state.passing = false
      }

      state.wasHigh = gateIn

      outputs.out[i] = gateIn && (state.passing as boolean) ? 1 : 0

      if ((state.rejectTimer as number) > 0) {
        outputs.reject[i] = 1
        state.rejectTimer = (state.rejectTimer as number) - 1
      } else {
        outputs.reject[i] = 0
      }
    }
  },
}
