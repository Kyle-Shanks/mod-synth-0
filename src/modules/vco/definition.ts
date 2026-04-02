import type { ModuleDefinition } from '../../engine/types'

interface VCOState {
  phase: number
  [key: string]: unknown
}

export const VCODefinition: ModuleDefinition<
  { frequency: { type: 'cv'; default: 0; label: 'v/oct' }; fm: { type: 'cv'; default: 0; label: 'fm' } },
  { sine: { type: 'audio'; default: 0; label: 'sin' }; saw: { type: 'audio'; default: 0; label: 'saw' }; pulse: { type: 'audio'; default: 0; label: 'pls' } },
  { frequency: { type: 'float'; min: 20; max: 20000; default: 440; label: 'freq'; unit: 'hz' }; detune: { type: 'float'; min: -100; max: 100; default: 0; label: 'tune'; unit: 'ct' }; pulseWidth: { type: 'float'; min: 0.01; max: 0.99; default: 0.5; label: 'width' } },
  VCOState
> = {
  id: 'vco',
  name: 'vco',
  category: 'source',
  width: 3,
  height: 5,

  inputs: {
    frequency: { type: 'cv',   default: 0, label: 'v/oct' },
    fm:        { type: 'cv',   default: 0, label: 'fm' },
  },
  outputs: {
    sine:  { type: 'audio', default: 0, label: 'sin' },
    saw:   { type: 'audio', default: 0, label: 'saw' },
    pulse: { type: 'audio', default: 0, label: 'pls' },
  },
  params: {
    frequency:  { type: 'float', min: 20,   max: 20000, default: 440, label: 'freq',  unit: 'hz' },
    detune:     { type: 'float', min: -100, max: 100,   default: 0,   label: 'tune',  unit: 'ct' },
    pulseWidth: { type: 'float', min: 0.01, max: 0.99,  default: 0.5, label: 'width' },
  },

  initialize(): VCOState {
    return { phase: 0 }
  },

  process(inputs, outputs, params, state, context) {
    const sampleRate = context.sampleRate
    const twoPi = 2 * Math.PI
    const detuneRatio = Math.pow(2, params.detune / 1200)

    for (let i = 0; i < 128; i++) {
      // cv input is v/oct: 0v = base freq, +1v = octave up, -1v = octave down
      const cvValue = inputs.frequency[i] ?? 0
      const cvFreq = cvValue !== 0
        ? params.frequency * Math.pow(2, cvValue)
        : params.frequency
      const fmAmount = inputs.fm[i] ?? 0
      const freq = Math.max(0.001, cvFreq * detuneRatio + fmAmount)

      // advance phase
      state.phase += freq / sampleRate
      if (state.phase >= 1) state.phase -= 1

      // generate waveforms
      outputs.sine[i]  = Math.sin(state.phase * twoPi)
      outputs.saw[i]   = 2 * state.phase - 1
      outputs.pulse[i] = state.phase < params.pulseWidth ? 1 : -1
    }
  }
}
