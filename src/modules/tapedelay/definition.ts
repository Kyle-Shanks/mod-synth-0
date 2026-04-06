import type { ModuleDefinition } from '../../engine/types'

interface TapeDelayState {
  buffer: Float32Array | null
  writeIdx: number
  filterState: number
  wowPhase: number
  wowPhase2: number
  flutterPhase: number
  initialized: boolean
  [key: string]: unknown
}

export const TapeDelayDefinition: ModuleDefinition<
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
      default: 0.4
      label: 'time'
      unit: 's'
      curve: 'log'
    }
    feedback: { type: 'float'; min: 0; max: 0.95; default: 0.55; label: 'fdbk' }
    tone: { type: 'float'; min: 0; max: 1; default: 0.6; label: 'tone' }
    wow: { type: 'float'; min: 0; max: 1; default: 0.15; label: 'wow' }
    drive: { type: 'float'; min: 0; max: 1; default: 0.2; label: 'drive' }
    mix: { type: 'float'; min: 0; max: 1; default: 0.4; label: 'mix' }
  },
  TapeDelayState
> = {
  id: 'tapedelay',
  name: 'tape delay',
  category: 'fx',
  width: 6,
  height: 3,

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
      default: 0.4,
      label: 'time',
      unit: 's',
      curve: 'log',
    },
    feedback: {
      type: 'float',
      min: 0,
      max: 0.95,
      default: 0.55,
      label: 'fdbk',
    },
    tone: { type: 'float', min: 0, max: 1, default: 0.6, label: 'tone' },
    wow: { type: 'float', min: 0, max: 1, default: 0.15, label: 'wow' },
    drive: { type: 'float', min: 0, max: 1, default: 0.2, label: 'drive' },
    mix: { type: 'float', min: 0, max: 1, default: 0.4, label: 'mix' },
  },

  initialize(): TapeDelayState {
    return {
      buffer: null,
      writeIdx: 0,
      filterState: 0,
      wowPhase: 0,
      wowPhase2: 0,
      flutterPhase: 0,
      initialized: false,
    }
  },

  process(inputs, outputs, params, state, context) {
    const sr = context.sampleRate
    const maxSamples = Math.round(sr * 2.5)

    if (!state.initialized) {
      state.buffer = new Float32Array(maxSamples)
      state.writeIdx = 0
      state.filterState = 0
      state.wowPhase = 0
      state.wowPhase2 = 0
      state.flutterPhase = 0
      state.initialized = true
    }

    const buf = state.buffer as Float32Array
    const bufLen = buf.length

    // tone: maps 0→1 to a lowpass cutoff 400→8000 Hz on the feedback path
    const toneFreq = 400 * Math.pow(20, params.tone)
    const toneCoeff = Math.exp((-2 * Math.PI * toneFreq) / sr)

    // wow/flutter modulation: two slow wow oscillators plus a faster flutter oscillator.
    const wowRate1 = (2 * Math.PI * 0.3) / sr
    const wowRate2 = (2 * Math.PI * 0.37) / sr
    const flutterRate = (2 * Math.PI * 5.4) / sr

    for (let i = 0; i < 128; i++) {
      const input = inputs.audio[i] ?? 0
      const timeCv = inputs.timeCv[i] ?? 0

      // advance wow LFOs
      state.wowPhase = ((state.wowPhase as number) + wowRate1) % (2 * Math.PI)
      state.wowPhase2 = ((state.wowPhase2 as number) + wowRate2) % (2 * Math.PI)
      state.flutterPhase =
        ((state.flutterPhase as number) + flutterRate) % (2 * Math.PI)

      const wowMod =
        (Math.sin(state.wowPhase as number) * 0.6 +
          Math.sin((state.wowPhase as number) * 3.1) * 0.3 +
          Math.sin(state.wowPhase2 as number) * 0.4) *
        params.wow *
        0.022
      const flutterMod =
        Math.sin(state.flutterPhase as number) * params.wow * 0.003

      const baseTime = Math.max(
        0.01,
        Math.min(2.0, params.time * Math.pow(2, timeCv)),
      )
      const delayTime = Math.max(0.005, baseTime * (1 + wowMod + flutterMod))

      // fractional delay with linear interpolation
      const delaySamplesF = Math.min(bufLen - 2, delayTime * sr)
      const delaySamplesI = Math.floor(delaySamplesF)
      const frac = delaySamplesF - delaySamplesI

      const r0pos =
        ((state.writeIdx as number) - delaySamplesI + bufLen) % bufLen
      const r1pos = (r0pos - 1 + bufLen) % bufLen
      const delayed = (buf[r0pos] ?? 0) * (1 - frac) + (buf[r1pos] ?? 0) * frac

      // tone filter on feedback path
      state.filterState =
        (1 - toneCoeff) * delayed + toneCoeff * (state.filterState as number)
      const toneFiltered = state.filterState as number

      // tape saturation (asymmetric soft clip for warmth)
      const driveAmt = 1 + params.drive * 4
      const driven = toneFiltered * driveAmt
      const saturated =
        driven > 0 ? driven / (1 + driven) : driven / (1 - driven)

      buf[state.writeIdx as number] = input + saturated * params.feedback
      state.writeIdx = ((state.writeIdx as number) + 1) % bufLen

      outputs.out[i] = input * (1 - params.mix) + delayed * params.mix
    }
  },
}
