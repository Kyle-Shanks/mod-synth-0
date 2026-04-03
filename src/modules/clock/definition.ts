import type { ModuleDefinition } from '../../engine/types'

interface ClockState {
  phase: number
  divCount: number
  gateHigh: boolean
  divGateHigh: boolean
  [key: string]: unknown
}

export const ClockDefinition: ModuleDefinition<
  {
    reset: { type: 'trigger'; default: 0; label: 'rst' }
  },
  {
    gate: { type: 'gate'; default: 0; label: 'gate' }
    trigger: { type: 'trigger'; default: 0; label: 'trig' }
    div: { type: 'gate'; default: 0; label: 'div' }
  },
  {
    bpm: {
      type: 'float'
      min: 20
      max: 300
      default: 120
      label: 'bpm'
      unit: 'bpm'
    }
    swing: {
      type: 'float'
      min: 0
      max: 0.75
      default: 0
      label: 'swing'
    }
    division: {
      type: 'select'
      default: 0
      label: 'div'
      options: ['/2', '/4', '/8', '/16']
    }
  },
  ClockState
> = {
  id: 'clock',
  name: 'clock',
  category: 'control',
  width: 3,
  height: 4,

  inputs: {
    reset: { type: 'trigger', default: 0, label: 'rst' },
  },
  outputs: {
    gate: { type: 'gate', default: 0, label: 'gate' },
    trigger: { type: 'trigger', default: 0, label: 'trig' },
    div: { type: 'gate', default: 0, label: 'div' },
  },
  params: {
    bpm: {
      type: 'float',
      min: 20,
      max: 300,
      default: 120,
      label: 'bpm',
      unit: 'bpm',
    },
    swing: {
      type: 'float',
      min: 0,
      max: 0.75,
      default: 0,
      label: 'swing',
    },
    division: {
      type: 'select',
      default: 0,
      label: 'div',
      options: ['/2', '/4', '/8', '/16'],
    },
  },

  initialize(): ClockState {
    return {
      phase: 0,
      divCount: 0,
      gateHigh: false,
      divGateHigh: false,
    }
  },

  process(inputs, outputs, params, state, context) {
    const sampleRate = context.sampleRate
    // bpm to Hz: quarter notes per second
    const freq = params.bpm / 60
    const phaseInc = freq / sampleRate
    // division ratios: /2, /4, /8, /16
    const divRatios = [2, 4, 8, 16]
    const divRatio = divRatios[Math.round(params.division)] ?? 4
    // gate duration: 50% duty cycle (adjusted by swing on even beats)
    const gateDuty = 0.5

    for (let i = 0; i < 128; i++) {
      // reset on trigger
      const resetVal = inputs.reset[i] ?? 0
      if (resetVal > 0.5) {
        state.phase = 0
        state.divCount = 0
        state.gateHigh = false
        state.divGateHigh = false
      }

      const prevPhase = state.phase
      state.phase += phaseInc
      const wrapped = state.phase >= 1

      if (wrapped) {
        state.phase -= 1
        state.divCount = (state.divCount + 1) % divRatio
      }

      // swing: offset even beats by swing amount (0-75% of beat duration)
      const isEvenBeat = state.divCount % 2 === 1
      const swingOffset = isEvenBeat ? params.swing * 0.5 : 0
      const effectivePhase = state.phase - swingOffset

      // main gate: high for first gateDuty fraction of cycle
      const newGateHigh = effectivePhase >= 0 && effectivePhase < gateDuty
      outputs.gate[i] = newGateHigh ? 1 : 0

      // trigger: 1-sample pulse on rising edge
      if (wrapped || (prevPhase < swingOffset && state.phase >= swingOffset)) {
        outputs.trigger[i] = 1
      } else {
        outputs.trigger[i] = 0
      }

      // divided output: high for first half of the division cycle
      const divPhase = state.divCount / divRatio
      outputs.div[i] = divPhase < 0.5 ? 1 : 0
    }

    // write indicator state for UI lights (last sample's state)
    const indBuf = state._indicatorBuffer as Int32Array | undefined
    if (indBuf) {
      Atomics.store(indBuf, 0, outputs.gate[127]! > 0.5 ? 1 : 0)
      Atomics.store(indBuf, 1, outputs.div[127]! > 0.5 ? 1 : 0)
    }
  },
}
