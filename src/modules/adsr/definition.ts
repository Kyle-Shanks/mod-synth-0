import type { ModuleDefinition } from '../../engine/types'

type Stage = 'idle' | 'attack' | 'decay' | 'sustain' | 'release'

interface ADSRState {
  stage: Stage
  currentLevel: number
  samplesInStage: number
  gateWasHigh: boolean
  [key: string]: unknown
}

export const ADSRDefinition: ModuleDefinition<
  { gate: { type: 'gate'; default: 0; label: 'gate' } },
  { envelope: { type: 'cv'; default: 0; label: 'out' } },
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
      max: 10
      default: 0.2
      label: 'dec'
      unit: 's'
    }
    sustain: { type: 'float'; min: 0; max: 1; default: 0.5; label: 'sus' }
    release: {
      type: 'float'
      min: 0.001
      max: 20
      default: 0.5
      label: 'rel'
      unit: 's'
    }
  },
  ADSRState
> = {
  id: 'adsr',
  name: 'adsr',
  category: 'envelope',
  width: 4,
  height: 3,

  inputs: {
    gate: { type: 'gate', default: 0, label: 'gate' },
  },
  outputs: {
    envelope: { type: 'cv', default: 0, label: 'out' },
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
      max: 10,
      default: 0.2,
      label: 'dec',
      unit: 's',
    },
    sustain: { type: 'float', min: 0, max: 1, default: 0.5, label: 'sus' },
    release: {
      type: 'float',
      min: 0.001,
      max: 20,
      default: 0.5,
      label: 'rel',
      unit: 's',
    },
  },

  initialize(): ADSRState {
    return {
      stage: 'idle',
      currentLevel: 0,
      samplesInStage: 0,
      gateWasHigh: false,
    }
  },

  process(inputs, outputs, params, state, context) {
    const sampleRate = context.sampleRate
    const attackSamples = Math.max(1, params.attack * sampleRate)
    const decaySamples = Math.max(1, params.decay * sampleRate)
    const releaseSamples = Math.max(1, params.release * sampleRate)
    const sustainLevel = params.sustain

    for (let i = 0; i < 128; i++) {
      const gateValue = inputs.gate[i] ?? 0
      const gateHigh = gateValue > 0.5

      // edge detection
      if (gateHigh && !state.gateWasHigh) {
        // rising edge — start attack from current level (retrigger)
        state.stage = 'attack'
        state.samplesInStage = 0
      } else if (!gateHigh && state.gateWasHigh) {
        // falling edge — immediately start release from wherever we are
        state.stage = 'release'
        state.samplesInStage = 0
      }
      state.gateWasHigh = gateHigh

      // advance envelope
      switch (state.stage) {
        case 'idle':
          state.currentLevel = 0
          break

        case 'attack': {
          // linear attack
          state.currentLevel += 1.0 / attackSamples
          state.samplesInStage++
          if (state.currentLevel >= 1.0) {
            state.currentLevel = 1.0
            state.stage = 'decay'
            state.samplesInStage = 0
          }
          break
        }

        case 'decay': {
          // exponential decay toward sustain level
          const decayRate = Math.exp(-Math.log(1000) / decaySamples) // -60dB in decaySamples
          state.currentLevel =
            sustainLevel + (state.currentLevel - sustainLevel) * decayRate
          state.samplesInStage++
          // snap to sustain when close enough
          if (Math.abs(state.currentLevel - sustainLevel) < 0.0001) {
            state.currentLevel = sustainLevel
            state.stage = 'sustain'
            state.samplesInStage = 0
          }
          break
        }

        case 'sustain':
          state.currentLevel = sustainLevel
          break

        case 'release': {
          // exponential release toward zero
          const releaseRate = Math.exp(-Math.log(1000) / releaseSamples) // -60dB in releaseSamples
          state.currentLevel *= releaseRate
          state.samplesInStage++
          if (state.currentLevel < 0.0001) {
            state.currentLevel = 0
            state.stage = 'idle'
            state.samplesInStage = 0
          }
          break
        }
      }

      outputs.envelope[i] = state.currentLevel
    }
  },
}
