import type { ModuleDefinition } from '../../engine/types'

interface PluckState {
  buffer: Float32Array | null
  writeIdx: number
  filterState: number
  apY1: number
  apX1: number
  apY2: number
  apX2: number
  exciteWasHigh: boolean
  initialized: boolean
  [key: string]: unknown
}

export const PluckDefinition: ModuleDefinition<
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
      max: 4000
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
    brightness: { type: 'float'; min: 0; max: 1; default: 0.5; label: 'bright' }
    position: {
      type: 'float'
      min: 0.01
      max: 0.99
      default: 0.12
      label: 'pos'
    }
    stiffness: { type: 'float'; min: 0; max: 0.9; default: 0.1; label: 'stiff' }
  },
  PluckState
> = {
  id: 'pluck',
  name: 'pluck',
  category: 'source',
  width: 5,
  height: 4,

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
      max: 4000,
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
    brightness: {
      type: 'float',
      min: 0,
      max: 1,
      default: 0.5,
      label: 'bright',
    },
    position: {
      type: 'float',
      min: 0.01,
      max: 0.99,
      default: 0.12,
      label: 'pos',
    },
    stiffness: {
      type: 'float',
      min: 0,
      max: 0.9,
      default: 0.1,
      label: 'stiff',
    },
  },

  initialize(): PluckState {
    return {
      buffer: null,
      writeIdx: 0,
      filterState: 0,
      apY1: 0,
      apX1: 0,
      apY2: 0,
      apX2: 0,
      exciteWasHigh: false,
      initialized: false,
    }
  },

  process(inputs, outputs, params, state, context) {
    if (!state.initialized) {
      state.buffer = new Float32Array(context.sampleRate)
      state.writeIdx = 0
      state.filterState = 0
      state.apY1 = 0
      state.apX1 = 0
      state.apY2 = 0
      state.apX2 = 0
      state.exciteWasHigh = false
      state.initialized = true
    }

    const buf = state.buffer as Float32Array
    const bufLen = buf.length
    const sr = context.sampleRate

    const pitchCv = inputs.pitch[0] ?? 0
    const freq = Math.max(
      20,
      Math.min(4000, params.frequency * Math.pow(2, pitchCv)),
    )
    const N = Math.max(2, Math.round(sr / freq))

    // lowpass damping coefficient — higher brightness = less damping
    const lpCoeff = 0.3 + params.brightness * 0.65

    // stiffness allpass coefficient — 0 → no effect, 0.9 → strong dispersion
    const apCoeff = params.stiffness * 0.97

    // check for custom excite audio
    const excBuf = inputs.exciteAudio
    let hasExcite = false
    for (let s = 0; s < 128; s++) {
      if ((excBuf[s] ?? 0) !== 0) {
        hasExcite = true
        break
      }
    }

    for (let i = 0; i < 128; i++) {
      const trigHigh = (inputs.excite[i] ?? 0) > 0.5

      if (trigHigh && !(state.exciteWasHigh as boolean)) {
        // seed delay line with position-shaped excitation
        // pos near 0 (bridge): very peaked envelope = bright/thin attack character
        // pos near 0.5 (center): smooth half-sine = full, rich sound
        // pos near 1 (far end): mirrored peak, cuts mid harmonics
        const pos = params.position
        const startIdx = ((state.writeIdx as number) - N + bufLen) % bufLen
        const bright = 0.3 + params.brightness * 0.7
        for (let s = 0; s < N; s++) {
          // posExp: large at small pos (near-bridge = very peaked), 2 at center
          const posExp = 2 / Math.max(0.04, Math.min(pos, 1 - pos))
          const posEnv = Math.pow(Math.sin(Math.PI * s / N), posExp)
          const raw = hasExcite ? (excBuf[s % 128] ?? 0) : Math.random() * 2 - 1
          buf[(startIdx + s) % bufLen] = raw * posEnv * bright
        }
      }
      state.exciteWasHigh = trigHigh

      const readIdx = ((state.writeIdx as number) - N + bufLen) % bufLen
      const delayed = buf[readIdx] ?? 0

      // two allpass filters in series for pronounced stiffness/inharmonicity
      const ap1Out =
        -apCoeff * (state.apY1 as number) +
        delayed +
        apCoeff * (state.apX1 as number)
      state.apX1 = delayed
      state.apY1 = ap1Out

      const apOut =
        -apCoeff * (state.apY2 as number) +
        ap1Out +
        apCoeff * (state.apX2 as number)
      state.apX2 = ap1Out
      state.apY2 = apOut

      // one-pole lowpass for string damping
      state.filterState =
        (state.filterState as number) * (1 - lpCoeff) + apOut * lpCoeff

      buf[state.writeIdx as number] =
        (state.filterState as number) * params.decay
      state.writeIdx = ((state.writeIdx as number) + 1) % bufLen

      outputs.out[i] = delayed
    }
  },
}
