import type { ModuleDefinition } from '../../engine/types'

interface CompressorState {
  envelope: number
  gainSmooth: number
  _meters: Record<string, number>
  [key: string]: unknown
}

export const CompressorDefinition: ModuleDefinition<
  {
    audio: { type: 'audio'; default: 0; label: 'in' }
    sidechain: { type: 'audio'; default: 0; label: 'sc' }
  },
  {
    out: { type: 'audio'; default: 0; label: 'out' }
    gr: { type: 'cv'; default: 0; label: 'gr' }
  },
  {
    threshold: {
      type: 'float'
      min: -60
      max: 0
      default: -12
      label: 'thresh'
      unit: 'db'
    }
    ratio: { type: 'float'; min: 1; max: 20; default: 4; label: 'ratio' }
    attack: {
      type: 'float'
      min: 0.1
      max: 200
      default: 5
      label: 'atk'
      unit: 'ms'
      curve: 'log'
    }
    release: {
      type: 'float'
      min: 10
      max: 2000
      default: 150
      label: 'rel'
      unit: 'ms'
      curve: 'log'
    }
    makeup: {
      type: 'float'
      min: 0
      max: 24
      default: 0
      label: 'gain'
      unit: 'db'
    }
    knee: {
      type: 'float'
      min: 0
      max: 12
      default: 6
      label: 'knee'
      unit: 'db'
    }
    mix: { type: 'float'; min: 0; max: 1; default: 1; label: 'mix' }
  },
  CompressorState
> = {
  id: 'compressor',
  name: 'compressor',
  category: 'dynamics',
  width: 6,
  height: 5,

  inputs: {
    audio: { type: 'audio', default: 0, label: 'in' },
    sidechain: { type: 'audio', default: 0, label: 'sc' },
  },
  outputs: {
    out: { type: 'audio', default: 0, label: 'out' },
    gr: { type: 'cv', default: 0, label: 'gr' },
  },
  params: {
    threshold: {
      type: 'float',
      min: -60,
      max: 0,
      default: -12,
      label: 'thresh',
      unit: 'db',
    },
    ratio: { type: 'float', min: 1, max: 20, default: 4, label: 'ratio' },
    attack: {
      type: 'float',
      min: 0.1,
      max: 200,
      default: 5,
      label: 'atk',
      unit: 'ms',
      curve: 'log',
    },
    release: {
      type: 'float',
      min: 10,
      max: 2000,
      default: 150,
      label: 'rel',
      unit: 'ms',
      curve: 'log',
    },
    makeup: {
      type: 'float',
      min: 0,
      max: 24,
      default: 0,
      label: 'gain',
      unit: 'db',
    },
    knee: {
      type: 'float',
      min: 0,
      max: 12,
      default: 6,
      label: 'knee',
      unit: 'db',
    },
    mix: { type: 'float', min: 0, max: 1, default: 1, label: 'mix' },
  },

  initialize(): CompressorState {
    return { envelope: 0, gainSmooth: 1, _meters: { gr: 1 } }
  },

  process(inputs, outputs, params, state, context) {
    const sr = context.sampleRate
    const attackCoeff = Math.exp(-1 / Math.max(1, (params.attack * sr) / 1000))
    const releaseCoeff = Math.exp(
      -1 / Math.max(1, (params.release * sr) / 1000),
    )
    const makeupLin = Math.pow(10, params.makeup / 20)
    const halfKnee = params.knee / 2
    const threshold = params.threshold
    const ratio = Math.max(1.001, params.ratio)

    // check if sidechain port has signal (non-zero values = connected)
    let hasSC = false
    for (let s = 0; s < 128; s++) {
      if ((inputs.sidechain[s] ?? 0) !== 0) {
        hasSC = true
        break
      }
    }

    for (let i = 0; i < 128; i++) {
      const input = inputs.audio[i] ?? 0
      const sc = hasSC ? (inputs.sidechain[i] ?? 0) : input

      // peak envelope follower on sidechain
      const level = Math.abs(sc)
      if (level > (state.envelope as number)) {
        state.envelope =
          attackCoeff * (state.envelope as number) + (1 - attackCoeff) * level
      } else {
        state.envelope =
          releaseCoeff * (state.envelope as number) + (1 - releaseCoeff) * level
      }

      // dB conversion
      const levelDb = 20 * Math.log10(Math.max(1e-6, state.envelope as number))
      const overDb = levelDb - threshold

      // gain computer with soft knee
      let gainReductionDb: number
      if (overDb <= -halfKnee) {
        gainReductionDb = 0
      } else if (overDb >= halfKnee) {
        gainReductionDb = -overDb * (1 - 1 / ratio)
      } else {
        gainReductionDb =
          ((-(overDb + halfKnee) * (overDb + halfKnee)) / (2 * params.knee)) *
          (1 - 1 / ratio)
      }

      // smooth gain application
      const targetGain = Math.pow(10, (gainReductionDb + params.makeup) / 20)
      if (targetGain < (state.gainSmooth as number)) {
        state.gainSmooth =
          attackCoeff * (state.gainSmooth as number) +
          (1 - attackCoeff) * targetGain
      } else {
        state.gainSmooth =
          releaseCoeff * (state.gainSmooth as number) +
          (1 - releaseCoeff) * targetGain
      }

      const wet = input * (state.gainSmooth as number)
      outputs.out[i] = input * (1 - params.mix) + wet * params.mix

      // gr output: 0 = max reduction, 1 = no reduction (normalized)
      const grRaw = (state.gainSmooth as number) / makeupLin
      outputs.gr[i] = Math.max(0, Math.min(1, grRaw))
    }

    // expose gain reduction to UI via generic meter mechanism
    ;(state._meters as Record<string, number>).gr = Math.max(0, Math.min(1, (state.gainSmooth as number) / makeupLin))
  },
}
