import type { ModuleDefinition } from '../../engine/types'

interface ARState {
  stage: string
  level: number
  gateWasHigh: boolean
  eocTimer: number
  [key: string]: unknown
}

export const ARDefinition: ModuleDefinition<
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
    release: {
      type: 'float'
      min: 0.001
      max: 20
      default: 0.3
      label: 'rel'
      unit: 's'
    }
  },
  ARState
> = {
  id: 'ar',
  name: 'ar',
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
    release: {
      type: 'float',
      min: 0.001,
      max: 20,
      default: 0.3,
      label: 'rel',
      unit: 's',
    },
  },

  initialize(): ARState {
    return { stage: 'idle', level: 0, gateWasHigh: false, eocTimer: 0 }
  },

  process(inputs, outputs, params, state, context) {
    const attackSamples = Math.max(1, params.attack * context.sampleRate)
    const releaseSamples = Math.max(1, params.release * context.sampleRate)
    const triggerDuration = Math.max(1, Math.round(context.sampleRate * 0.004))
    const releaseDecay = Math.exp(-Math.log(1000) / releaseSamples)

    for (let i = 0; i < 128; i++) {
      const gateHigh = (inputs.gate[i] ?? 0) > 0.5

      // rising edge: start attack
      if (gateHigh && !state.gateWasHigh) {
        state.stage = 'attack'
      }

      // falling edge in gate mode: start release from hold
      if (
        !gateHigh &&
        state.gateWasHigh &&
        state.stage === 'hold'
      ) {
        state.stage = 'release'
      }

      state.gateWasHigh = gateHigh

      // advance envelope
      if (state.stage === 'attack') {
        state.level += 1 / attackSamples
        if (state.level >= 1) {
          state.level = 1
          state.stage = 'hold'
        }
      } else if (state.stage === 'hold') {
        state.level = 1
        // gate mode: release on gate-low handled above
      } else if (state.stage === 'release') {
        state.level *= releaseDecay
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
