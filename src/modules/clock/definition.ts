import type { ModuleDefinition } from '../../engine/types'

interface ClockState {
  phase: number
  beatCount: number
  triggerTimer: number
  [key: string]: unknown
}

export const ClockDefinition: ModuleDefinition<
  {
    reset: { type: 'trigger'; default: 0; label: 'reset' }
  },
  {
    gate: { type: 'gate'; default: 0; label: 'gate' }
    trigger: { type: 'trigger'; default: 0; label: 'trig' }
  },
  {
    bpm: {
      type: 'float'
      min: 20
      max: 600
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
  },
  ClockState
> = {
  id: 'clock',
  name: 'clock',
  category: 'control',
  width: 3,
  height: 3,

  inputs: {
    reset: { type: 'trigger', default: 0, label: 'reset' },
  },
  outputs: {
    gate: { type: 'gate', default: 0, label: 'gate' },
    trigger: { type: 'trigger', default: 0, label: 'trig' },
  },
  params: {
    bpm: {
      type: 'float',
      min: 20,
      max: 600,
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
  },

  initialize(): ClockState {
    return {
      phase: 0,
      beatCount: 0,
      triggerTimer: 0,
    }
  },

  process(inputs, outputs, params, state, context) {
    const sampleRate = context.sampleRate
    // bpm to Hz: quarter notes per second
    const freq = params.bpm / 60
    const phaseInc = freq / sampleRate
    // gate duration: 50% duty cycle (adjusted by swing on even beats)
    const gateDuty = 0.5
    // 4ms trigger pulse duration (matches pushbutton behavior)
    const triggerDuration = Math.round(sampleRate * 0.004)
    let triggerHighInBlock = 0

    for (let i = 0; i < 128; i++) {
      // reset on trigger
      const resetVal = inputs.reset[i] ?? 0
      if (resetVal > 0.5) {
        state.phase = 0
        state.beatCount = 0
      }

      const prevPhase = state.phase
      state.phase += phaseInc
      const wrapped = state.phase >= 1

      if (wrapped) {
        state.phase -= 1
        state.beatCount = (state.beatCount + 1) % 2
      }

      // swing: offset even beats by swing amount (0-75% of beat duration)
      const isEvenBeat = state.beatCount % 2 === 1
      const swingOffset = isEvenBeat ? params.swing * 0.5 : 0
      const effectivePhase = state.phase - swingOffset

      // main gate: high for first gateDuty fraction of cycle
      const newGateHigh = effectivePhase >= 0 && effectivePhase < gateDuty
      outputs.gate[i] = newGateHigh ? 1 : 0

      // trigger: 4ms pulse on rising edge (matches pushbutton trigger width)
      if (wrapped || (prevPhase < swingOffset && state.phase >= swingOffset)) {
        state.triggerTimer = triggerDuration
      }
      if (state.triggerTimer > 0) {
        outputs.trigger[i] = 1
        state.triggerTimer--
        triggerHighInBlock = 1
      } else {
        outputs.trigger[i] = 0
      }
    }

    // write indicator state for UI lights (last sample's state)
    const indBuf = state._indicatorBuffer as Int32Array | undefined
    if (indBuf) {
      Atomics.store(indBuf, 0, outputs.gate[127]! > 0.5 ? 1 : 0)
      Atomics.store(indBuf, 1, triggerHighInBlock)
    }
  },
}
