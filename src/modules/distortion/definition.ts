import type { ModuleDefinition } from '../../engine/types'

interface DistortionState {
  lpState: number
  prevIn: number
  [key: string]: unknown
}

export const DistortionDefinition: ModuleDefinition<
  {
    in: { type: 'audio'; default: 0; label: 'in' }
  },
  {
    out: { type: 'audio'; default: 0; label: 'out' }
  },
  {
    mode: {
      type: 'select'
      default: 0
      options: ['soft', 'hard', 'fuzz']
      label: 'mode'
    }
    drive: {
      type: 'float'
      min: 1
      max: 100
      default: 5
      label: 'drive'
      curve: 'log'
    }
    tone: { type: 'float'; min: 0; max: 1; default: 0.5; label: 'tone' }
    level: { type: 'float'; min: 0; max: 1; default: 0.7; label: 'level' }
  },
  DistortionState
> = {
  id: 'dist',
  name: 'dist',
  category: 'fx',
  width: 3,
  height: 4,

  inputs: {
    in: { type: 'audio', default: 0, label: 'in' },
  },
  outputs: {
    out: { type: 'audio', default: 0, label: 'out' },
  },
  params: {
    mode: {
      type: 'select',
      default: 0,
      options: ['soft', 'hard', 'fuzz'],
      label: 'mode',
    },
    drive: {
      type: 'float',
      min: 1,
      max: 100,
      default: 5,
      label: 'drive',
      curve: 'log',
    },
    tone: { type: 'float', min: 0, max: 1, default: 0.5, label: 'tone' },
    level: { type: 'float', min: 0, max: 1, default: 0.7, label: 'level' },
  },

  initialize(): DistortionState {
    return { lpState: 0, prevIn: 0 }
  },

  process(inputs, outputs, params, state, context) {
    function shapedSaturator(x: number, shape: number): number {
      return ((1 + shape) * x) / (1 + shape * Math.abs(x))
    }
    function thresholdClip(x: number, threshold: number): number {
      const clipped = Math.max(-threshold, Math.min(threshold, x))
      return clipped / threshold
    }
    // Deliberately asymmetric curve so fuzz has a distinctly different character.
    function fuzzCurve(x: number): number {
      if (x >= 0) return 1 - Math.exp(-x * 3.2)
      return -(1 - Math.exp(x * 1.6))
    }

    const mode = Math.round(params.mode)
    const driveNorm = Math.log(params.drive) / Math.log(100)
    const cutoff = 250 + params.tone * 9500
    // 2x oversampling for the shaping stage.
    const overSampleRate = context.sampleRate * 2
    const lpCoeff = 1 - Math.exp((-2 * Math.PI * cutoff) / overSampleRate)
    const hardThreshold = Math.max(0.25, 0.9 - driveNorm * 0.5)
    const hardPreGain = 1 + driveNorm * 4
    let prevIn = state.prevIn as number

    for (let i = 0; i < 128; i++) {
      const inputSample = inputs.in[i] ?? 0
      // Zero-order stage with midpoint interpolation gives a low-cost 2x path.
      const midSample = prevIn + (inputSample - prevIn) * 0.5
      prevIn = inputSample

      let overSampleAccum = 0

      for (let os = 0; os < 2; os++) {
        const src = os === 0 ? midSample : inputSample
        const driven = src * params.drive
        let shaped: number

        if (mode === 0) {
          // soft: rounded saturation
          shaped = shapedSaturator(driven, 0.5 + driveNorm * 0.8)
        } else if (mode === 1) {
          // hard: same family as soft, then stronger threshold clip for high-drive artifacts
          const preShaped = shapedSaturator(driven, 1.2 + driveNorm * 1.5)
          shaped = thresholdClip(preShaped * hardPreGain, hardThreshold)
        } else {
          // fuzz: intentionally different transfer curve
          shaped = fuzzCurve(driven * (1.8 + driveNorm * 1.5))
        }

        state.lpState =
          (state.lpState as number) +
          (shaped - (state.lpState as number)) * lpCoeff
        overSampleAccum += state.lpState as number
      }

      const downSampled = overSampleAccum * 0.5
      const out = downSampled * params.level
      outputs.out[i] = Math.max(-1, Math.min(1, out))
    }

    state.prevIn = prevIn
  },
}
