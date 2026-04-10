import type { ModuleDefinition } from '../../engine/types'

type Stage = 'idle' | 'attack' | 'decay'

interface ADState {
  stage: Stage
  level: number
  gateWasHigh: boolean
  eocTimer: number
  [key: string]: unknown
}

export const ADDefinition: ModuleDefinition<
  {
    gate: { type: 'gate'; default: 0; label: 'gate' }
  },
  {
    out: { type: 'cv'; default: 0; label: 'out' }
    eoc: { type: 'trigger'; default: 0; label: 'eoc' }
  },
  {
    attack: {
      type: 'float'
      min: 0.001
      max: 10
      default: 0.01
      label: 'atk'
      unit: 's'
    }
    decay: {
      type: 'float'
      min: 0.001
      max: 20
      default: 0.3
      label: 'dec'
      unit: 's'
    }
  },
  ADState
> = {
  id: 'ad',
  name: 'ad',
  category: 'envelope',
  width: 3,
  height: 3,

  inputs: {
    gate: { type: 'gate', default: 0, label: 'gate' },
  },
  outputs: {
    out: { type: 'cv', default: 0, label: 'out' },
    eoc: { type: 'trigger', default: 0, label: 'eoc' },
  },
  params: {
    attack: {
      type: 'float',
      min: 0.001,
      max: 10,
      default: 0.01,
      label: 'atk',
      unit: 's',
    },
    decay: {
      type: 'float',
      min: 0.001,
      max: 20,
      default: 0.3,
      label: 'dec',
      unit: 's',
    },
  },

  initialize(): ADState {
    return { stage: 'idle', level: 0, gateWasHigh: false, eocTimer: 0 }
  },

  process(inputs, outputs, params, state, context) {
    const attackSamples = Math.max(1, params.attack * context.sampleRate)
    const decaySamples = Math.max(1, params.decay * context.sampleRate)
    const triggerDuration = Math.max(1, Math.round(context.sampleRate * 0.004))
    const decayRate = Math.exp(-Math.log(1000) / decaySamples)

    for (let i = 0; i < 128; i++) {
      const gateHigh = (inputs.gate[i] ?? 0) > 0.5

      if (gateHigh && !state.gateWasHigh) {
        state.stage = 'attack'
      }
      state.gateWasHigh = gateHigh

      if (state.stage === 'attack') {
        state.level += 1 / attackSamples
        if (state.level >= 1) {
          state.level = 1
          state.stage = 'decay'
        }
      } else if (state.stage === 'decay') {
        state.level *= decayRate
        if (state.level < 0.001) {
          state.level = 0
          state.stage = 'idle'
          state.eocTimer = triggerDuration
        }
      } else {
        state.level = 0
      }

      outputs.out[i] = state.level
      if (state.eocTimer > 0) {
        outputs.eoc[i] = 1
        state.eocTimer--
      } else {
        outputs.eoc[i] = 0
      }
    }
  },
}
