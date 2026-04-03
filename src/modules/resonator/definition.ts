import type { ModuleDefinition } from '../../engine/types'

interface ResonatorState {
  buffer: null | Float32Array
  writeIdx: number
  filterState: number
  initialized: boolean
  exciteTrigWasHigh: boolean
  [key: string]: unknown
}

export const ResonatorDefinition: ModuleDefinition<
  {
    excite: { type: 'trigger'; default: 0; label: 'excite' }
    pitch: { type: 'cv'; default: 0; label: 'v/oct' }
    exciteAudio: { type: 'audio'; default: 0; label: 'exc in' }
  },
  {
    out: { type: 'audio'; default: 0; label: 'out' }
  },
  {
    frequency: {
      type: 'float'
      min: 20
      max: 2000
      default: 220
      label: 'freq'
      unit: 'hz'
      curve: 'log'
    }
    decay: {
      type: 'float'
      min: 0.9
      max: 0.9999
      default: 0.995
      label: 'decay'
    }
    damping: { type: 'float'; min: 0; max: 1; default: 0.5; label: 'damp' }
    level: { type: 'float'; min: 0; max: 1; default: 0.8; label: 'level' }
  },
  ResonatorState
> = {
  id: 'resonator',
  name: 'resonator',
  category: 'source',
  width: 4,
  height: 3,

  inputs: {
    excite: { type: 'trigger', default: 0, label: 'excite' },
    pitch: { type: 'cv', default: 0, label: 'v/oct' },
    exciteAudio: { type: 'audio', default: 0, label: 'exc in' },
  },
  outputs: {
    out: { type: 'audio', default: 0, label: 'out' },
  },
  params: {
    frequency: {
      type: 'float',
      min: 20,
      max: 2000,
      default: 220,
      label: 'freq',
      unit: 'hz',
      curve: 'log',
    },
    decay: {
      type: 'float',
      min: 0.9,
      max: 0.9999,
      default: 0.995,
      label: 'decay',
    },
    damping: { type: 'float', min: 0, max: 1, default: 0.5, label: 'damp' },
    level: { type: 'float', min: 0, max: 1, default: 0.8, label: 'level' },
  },

  initialize(): ResonatorState {
    return {
      buffer: null,
      writeIdx: 0,
      filterState: 0,
      initialized: false,
      exciteTrigWasHigh: false,
    }
  },

  process(inputs, outputs, params, state, context) {
    // lazy init — one-time allocation on first process() call
    if (!state.initialized) {
      state.buffer = new Float32Array(context.sampleRate)
      state.writeIdx = 0
      state.filterState = 0
      state.initialized = true
    }

    const buf = state.buffer as Float32Array
    const bufLen = buf.length

    // apply v/oct pitch CV (use first sample of the pitch input buffer)
    const pitchCv = inputs.pitch.length > 0 ? (inputs.pitch[0] ?? 0) : 0
    const freq = Math.max(
      20,
      Math.min(4000, params.frequency * Math.pow(2, pitchCv)),
    )
    const delaySamples = Math.max(
      2,
      Math.min(bufLen - 1, Math.round(context.sampleRate / freq)),
    )
    const dampCoeff = 1 - params.damping * 0.9

    // check if exciteAudio has actual signal (unconnected ports are filled with zeros)
    const excBuf = inputs.exciteAudio
    let hasExciteSignal = false
    for (let s = 0; s < 128; s++) {
      if ((excBuf[s] ?? 0) !== 0) { hasExciteSignal = true; break }
    }

    for (let i = 0; i < 128; i++) {
      // excite on rising trigger edge: seed delay line with noise or audio excitation
      const trigHigh = (inputs.excite[i] ?? 0) > 0.5
      if (trigHigh && !state.exciteTrigWasHigh) {
        // seed at readIdx (= writeIdx - delaySamples) so values are read
        // immediately as the write pointer advances through them
        const startIdx = ((state.writeIdx as number) - delaySamples + bufLen) % bufLen
        for (let s = 0; s < delaySamples; s++) {
          const seed = hasExciteSignal
            ? (excBuf[s % 128] ?? 0)
            : (Math.random() * 2 - 1)
          buf[(startIdx + s) % bufLen] = seed * params.level
        }
      }
      state.exciteTrigWasHigh = trigHigh

      // Karplus-Strong feedback with one-pole lowpass damping
      const readIdx =
        ((state.writeIdx as number) - delaySamples + bufLen) % bufLen
      const delayed = buf[readIdx] ?? 0
      state.filterState =
        (state.filterState as number) * (1 - dampCoeff) + delayed * dampCoeff
      buf[state.writeIdx as number] =
        (state.filterState as number) * params.decay
      state.writeIdx = ((state.writeIdx as number) + 1) % bufLen
      outputs.out[i] = delayed * params.level
    }
  },
}
