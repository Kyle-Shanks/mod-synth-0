import type { ModuleDefinition } from '../../engine/types'

interface DistortionState {
  lpState: number
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
    drive: {
      type: 'float'
      min: 1
      max: 100
      default: 5
      label: 'drive'
      curve: 'log'
    }
    mode: {
      type: 'select'
      default: 0
      options: ['soft', 'hard', 'fuzz']
      label: 'mode'
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
    drive: {
      type: 'float',
      min: 1,
      max: 100,
      default: 5,
      label: 'drive',
      curve: 'log',
    },
    mode: {
      type: 'select',
      default: 0,
      options: ['soft', 'hard', 'fuzz'],
      label: 'mode',
    },
    tone: { type: 'float', min: 0, max: 1, default: 0.5, label: 'tone' },
    level: { type: 'float', min: 0, max: 1, default: 0.7, label: 'level' },
  },

  initialize(): DistortionState {
    return { lpState: 0 }
  },

  process(inputs, outputs, params, state, context) {
    function softClip(x: number): number {
      return Math.tanh(x)
    }
    function hardClip(x: number): number {
      return Math.max(-1, Math.min(1, x))
    }
    function fuzz(x: number): number {
      return Math.sign(x) * Math.min(1, Math.abs(x) * 2)
    }

    const mode = Math.round(params.mode)
    const cutoff = 200 + params.tone * 8000
    const lpCoeff = 1 - Math.exp((-2 * Math.PI * cutoff) / context.sampleRate)

    for (let i = 0; i < 128; i++) {
      const driven = (inputs.in[i] ?? 0) * params.drive
      let clipped: number
      if (mode === 0) {
        clipped = softClip(driven)
      } else if (mode === 1) {
        clipped = hardClip(driven)
      } else {
        clipped = fuzz(driven)
      }
      state.lpState =
        (state.lpState as number) +
        (clipped - (state.lpState as number)) * lpCoeff
      outputs.out[i] = (state.lpState as number) * params.level
    }
  },
}
