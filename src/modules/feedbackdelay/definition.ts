import type { ModuleDefinition } from '../../engine/types'

interface FeedbackDelayState {
  buffer: Float32Array | null
  writeIdx: number
  filterState: number
  initialized: boolean
  [key: string]: unknown
}

export const FeedbackDelayDefinition: ModuleDefinition<
  {
    audio: { type: 'audio'; default: 0; label: 'in' }
    timeCv: { type: 'cv'; default: 0; label: 'time' }
  },
  {
    out: { type: 'audio'; default: 0; label: 'out' }
  },
  {
    time: {
      type: 'float'
      min: 0.01
      max: 2.0
      default: 0.3
      label: 'time'
      unit: 's'
      curve: 'log'
    }
    feedback: { type: 'float'; min: 0; max: 0.95; default: 0.5; label: 'fdbk' }
    tone: {
      type: 'float'
      min: 200
      max: 10000
      default: 4000
      label: 'tone'
      unit: 'hz'
      curve: 'log'
    }
    mix: { type: 'float'; min: 0; max: 1; default: 0.4; label: 'mix' }
  },
  FeedbackDelayState
> = {
  id: 'feedbackdelay',
  name: 'feedback delay',
  category: 'fx',
  width: 5,
  height: 4,

  inputs: {
    audio: { type: 'audio', default: 0, label: 'in' },
    timeCv: { type: 'cv', default: 0, label: 'time' },
  },
  outputs: {
    out: { type: 'audio', default: 0, label: 'out' },
  },
  params: {
    time: {
      type: 'float',
      min: 0.01,
      max: 2.0,
      default: 0.3,
      label: 'time',
      unit: 's',
      curve: 'log',
    },
    feedback: { type: 'float', min: 0, max: 0.95, default: 0.5, label: 'fdbk' },
    tone: {
      type: 'float',
      min: 200,
      max: 10000,
      default: 4000,
      label: 'tone',
      unit: 'hz',
      curve: 'log',
    },
    mix: { type: 'float', min: 0, max: 1, default: 0.4, label: 'mix' },
  },

  initialize(): FeedbackDelayState {
    return { buffer: null, writeIdx: 0, filterState: 0, initialized: false }
  },

  process(inputs, outputs, params, state, context) {
    const sr = context.sampleRate
    const maxSamples = Math.round(sr * 2.5)

    if (!state.initialized) {
      state.buffer = new Float32Array(maxSamples)
      state.writeIdx = 0
      state.filterState = 0
      state.initialized = true
    }

    const buf = state.buffer as Float32Array
    const bufLen = buf.length
    // one-pole lowpass coefficient for tone filter on feedback path
    const toneCoeff = Math.exp((-2 * Math.PI * params.tone) / sr)

    for (let i = 0; i < 128; i++) {
      const input = inputs.audio[i] ?? 0
      const timeCv = inputs.timeCv[i] ?? 0
      // CV modulates time by ±1 octave
      const delayTime = Math.max(
        0.01,
        Math.min(2.0, params.time * Math.pow(2, timeCv)),
      )
      const delaySamples = Math.min(bufLen - 2, delayTime * sr)

      // fractional delay with linear interpolation
      const readF = (state.writeIdx as number) - delaySamples
      const readI = Math.floor(readF)
      const frac = readF - readI
      const r0 = buf[((readI % bufLen) + bufLen) % bufLen] ?? 0
      const r1 = buf[(((readI - 1) % bufLen) + bufLen) % bufLen] ?? 0
      const delayed = r0 * (1 - frac) + r1 * frac

      // tone filter (one-pole lowpass) applied to feedback path
      state.filterState =
        (1 - toneCoeff) * delayed + toneCoeff * (state.filterState as number)
      const toneFiltered = state.filterState as number

      // soft saturation in feedback path
      const fb = toneFiltered * params.feedback
      const saturated = Math.tanh(fb * 1.5) / 1.5

      buf[state.writeIdx as number] = input + saturated
      state.writeIdx = ((state.writeIdx as number) + 1) % bufLen

      outputs.out[i] = input * (1 - params.mix) + delayed * params.mix
    }
  },
}
