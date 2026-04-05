import type { ModuleDefinition } from '../../engine/types'

interface FMOpState {
  phase: number
  feedbackSample: number
  [key: string]: unknown
}

export const FMOpDefinition: ModuleDefinition<
  {
    voct: { type: 'cv'; default: 0; label: 'v/oct' }
    modIn: { type: 'audio'; default: 0; label: 'mod in' }
  },
  {
    out: { type: 'audio'; default: 0; label: 'out' }
  },
  {
    ratio: { type: 'float'; min: 0.5; max: 16; default: 1; label: 'ratio' }
    fine: {
      type: 'float'
      min: -50
      max: 50
      default: 0
      label: 'fine'
      unit: 'ct'
    }
    index: { type: 'float'; min: 0; max: 12; default: 2; label: 'index' }
    level: { type: 'float'; min: 0; max: 1; default: 0.8; label: 'level' }
    feedback: { type: 'float'; min: 0; max: 0.9; default: 0; label: 'fdbk' }
  },
  FMOpState
> = {
  id: 'fmop',
  name: 'fm op',
  category: 'source',
  width: 5,
  height: 4,

  inputs: {
    voct: { type: 'cv', default: 0, label: 'v/oct' },
    modIn: { type: 'audio', default: 0, label: 'mod in' },
  },
  outputs: {
    out: { type: 'audio', default: 0, label: 'out' },
  },
  params: {
    ratio: { type: 'float', min: 0.5, max: 16, default: 1, label: 'ratio' },
    fine: {
      type: 'float',
      min: -50,
      max: 50,
      default: 0,
      label: 'fine',
      unit: 'ct',
    },
    index: { type: 'float', min: 0, max: 12, default: 2, label: 'index' },
    level: { type: 'float', min: 0, max: 1, default: 0.8, label: 'level' },
    feedback: { type: 'float', min: 0, max: 0.9, default: 0, label: 'fdbk' },
  },

  initialize(): FMOpState {
    return { phase: 0, feedbackSample: 0 }
  },

  process(inputs, outputs, params, state, context) {
    const sr = context.sampleRate
    const twoPi = 2 * Math.PI
    const baseRef = 440 // A4 at 0 v/oct

    for (let i = 0; i < 128; i++) {
      const voct = inputs.voct[i] ?? 0
      const modInput = inputs.modIn[i] ?? 0

      // frequency: baseRef * 2^voct * ratio * fine_detune
      const fineRatio = Math.pow(2, params.fine / 1200)
      const freq = Math.max(
        0.001,
        baseRef * Math.pow(2, voct) * params.ratio * fineRatio,
      )

      // phase modulation: modulator drives phase offset
      const totalMod =
        modInput * params.index +
        (state.feedbackSample as number) * params.feedback

      state.phase = (state.phase as number) + freq / sr
      if ((state.phase as number) >= 1) (state.phase as number) -= 1

      const out =
        Math.sin((state.phase as number) * twoPi + totalMod * twoPi) *
        params.level
      state.feedbackSample = out
      outputs.out[i] = out
    }
  },
}
