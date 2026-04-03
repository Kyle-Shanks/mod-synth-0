import type { ModuleDefinition } from '../../engine/types'

interface SequencerState {
  currentStep: number
  gateWasHigh: boolean
  gateRemainingSamples: number
  [key: string]: unknown
}

export const SequencerDefinition: ModuleDefinition<
  {
    clock: { type: 'gate'; default: 0; label: 'clk' }
    reset: { type: 'trigger'; default: 0; label: 'rst' }
  },
  {
    cv: { type: 'cv'; default: 0; label: 'cv' }
    gate: { type: 'gate'; default: 0; label: 'gate' }
  },
  {
    steps: {
      type: 'int'
      min: 1
      max: 8
      default: 8
      label: 'steps'
    }
    gateLength: {
      type: 'float'
      min: 0.01
      max: 0.99
      default: 0.5
      label: 'gate'
    }
    step1: { type: 'float'; min: -2; max: 2; default: 0; label: '1' }
    step2: { type: 'float'; min: -2; max: 2; default: 0; label: '2' }
    step3: { type: 'float'; min: -2; max: 2; default: 0; label: '3' }
    step4: { type: 'float'; min: -2; max: 2; default: 0; label: '4' }
    step5: { type: 'float'; min: -2; max: 2; default: 0; label: '5' }
    step6: { type: 'float'; min: -2; max: 2; default: 0; label: '6' }
    step7: { type: 'float'; min: -2; max: 2; default: 0; label: '7' }
    step8: { type: 'float'; min: -2; max: 2; default: 0; label: '8' }
  },
  SequencerState
> = {
  id: 'sequencer',
  name: 'seq',
  category: 'control',
  width: 5,
  height: 4,

  inputs: {
    clock: { type: 'gate', default: 0, label: 'clk' },
    reset: { type: 'trigger', default: 0, label: 'rst' },
  },
  outputs: {
    cv: { type: 'cv', default: 0, label: 'cv' },
    gate: { type: 'gate', default: 0, label: 'gate' },
  },
  params: {
    steps: {
      type: 'int',
      min: 1,
      max: 8,
      default: 8,
      label: 'steps',
    },
    gateLength: {
      type: 'float',
      min: 0.01,
      max: 0.99,
      default: 0.5,
      label: 'gate',
    },
    step1: { type: 'float', min: -2, max: 2, default: 0, label: '1' },
    step2: { type: 'float', min: -2, max: 2, default: 0, label: '2' },
    step3: { type: 'float', min: -2, max: 2, default: 0, label: '3' },
    step4: { type: 'float', min: -2, max: 2, default: 0, label: '4' },
    step5: { type: 'float', min: -2, max: 2, default: 0, label: '5' },
    step6: { type: 'float', min: -2, max: 2, default: 0, label: '6' },
    step7: { type: 'float', min: -2, max: 2, default: 0, label: '7' },
    step8: { type: 'float', min: -2, max: 2, default: 0, label: '8' },
  },

  initialize(): SequencerState {
    return {
      currentStep: 0,
      gateWasHigh: false,
      gateRemainingSamples: 0,
    }
  },

  process(inputs, outputs, params, state, context) {
    const sampleRate = context.sampleRate
    const numSteps = Math.max(1, Math.min(8, Math.round(params.steps)))
    // step values stored in params as step1..step8
    const stepValues = [
      params.step1,
      params.step2,
      params.step3,
      params.step4,
      params.step5,
      params.step6,
      params.step7,
      params.step8,
    ]
    // gate length in samples (fraction of assumed step duration ~100ms)
    const gateSamples = Math.max(1, Math.round(params.gateLength * sampleRate * 0.1))

    for (let i = 0; i < 128; i++) {
      // reset on trigger
      const resetVal = inputs.reset[i] ?? 0
      if (resetVal > 0.5) {
        state.currentStep = 0
        state.gateRemainingSamples = 0
      }

      // advance on clock rising edge
      const clockVal = inputs.clock[i] ?? 0
      const clockHigh = clockVal > 0.5

      if (clockHigh && !state.gateWasHigh) {
        state.currentStep = (state.currentStep + 1) % numSteps
        state.gateRemainingSamples = gateSamples
      }
      state.gateWasHigh = clockHigh

      // output CV for current step
      const stepIdx = state.currentStep % numSteps
      outputs.cv[i] = stepValues[stepIdx] ?? 0

      // output gate
      if (state.gateRemainingSamples > 0) {
        outputs.gate[i] = 1
        state.gateRemainingSamples--
      } else {
        outputs.gate[i] = 0
      }
    }

    // write indicator state for UI step lights
    const indBuf = state._indicatorBuffer as Int32Array | undefined
    if (indBuf) {
      Atomics.store(indBuf, 0, state.currentStep as number)
    }
  },
}
