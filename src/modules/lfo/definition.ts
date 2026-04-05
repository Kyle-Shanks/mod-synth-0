import type { ModuleDefinition } from '../../engine/types'

interface LFOState {
  phase: number
  [key: string]: unknown
}

export const LFODefinition: ModuleDefinition<
  {
    rateCv: { type: 'cv'; default: 0; label: 'rate cv' }
  },
  {
    sine: { type: 'cv'; default: 0; label: 'sin' }
    saw: { type: 'cv'; default: 0; label: 'saw' }
    pulse: { type: 'cv'; default: 0; label: 'pls' }
    triangle: { type: 'cv'; default: 0; label: 'tri' }
  },
  {
    rate: {
      type: 'float'
      min: 0.01
      max: 100
      default: 1
      label: 'rate'
      unit: 'hz'
      curve: 'log'
    }
    pulseWidth: {
      type: 'float'
      min: 0.01
      max: 0.99
      default: 0.5
      label: 'width'
    }
  },
  LFOState
> = {
  id: 'lfo',
  name: 'lfo',
  category: 'source',
  width: 4,
  height: 3,

  inputs: {
    rateCv: { type: 'cv', default: 0, label: 'rate cv' },
  },
  outputs: {
    sine: { type: 'cv', default: 0, label: 'sin' },
    saw: { type: 'cv', default: 0, label: 'saw' },
    pulse: { type: 'cv', default: 0, label: 'pls' },
    triangle: { type: 'cv', default: 0, label: 'tri' },
  },
  params: {
    rate: {
      type: 'float',
      min: 0.01,
      max: 100,
      default: 1,
      label: 'rate',
      unit: 'hz',
      curve: 'log',
    },
    pulseWidth: {
      type: 'float',
      min: 0.01,
      max: 0.99,
      default: 0.5,
      label: 'width',
    },
  },

  initialize(): LFOState {
    return { phase: 0 }
  },

  process(inputs, outputs, params, state, context) {
    const sampleRate = context.sampleRate
    const twoPi = 2 * Math.PI

    for (let i = 0; i < 128; i++) {
      const rateMod = inputs.rateCv[i] ?? 0
      // cv modulates rate exponentially: +1v = double rate
      const rate = params.rate * Math.pow(2, rateMod)
      const freq = Math.max(0.001, rate)

      state.phase += freq / sampleRate
      if (state.phase >= 1) state.phase -= 1

      // all outputs are bipolar (-1 to +1)
      outputs.sine[i] = Math.sin(state.phase * twoPi)
      outputs.saw[i] = 2 * state.phase - 1
      outputs.pulse[i] = state.phase < params.pulseWidth ? 1 : -1
      // triangle: ramp up 0->1 in first half, ramp down 1->0 in second half
      outputs.triangle[i] =
        state.phase < 0.5 ? 4 * state.phase - 1 : 3 - 4 * state.phase
    }
  },
}
