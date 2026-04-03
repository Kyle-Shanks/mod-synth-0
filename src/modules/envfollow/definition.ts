import type { ModuleDefinition } from '../../engine/types'

interface EnvFollowState {
  envelope: number
  [key: string]: unknown
}

export const EnvFollowDefinition: ModuleDefinition<
  {
    in: { type: 'audio'; default: 0; label: 'in' }
  },
  {
    out: { type: 'cv'; default: 0; label: 'out' }
  },
  {
    attack: {
      type: 'float'
      min: 0.001
      max: 0.5
      default: 0.01
      label: 'atk'
      unit: 's'
    }
    release: {
      type: 'float'
      min: 0.001
      max: 2
      default: 0.1
      label: 'rel'
      unit: 's'
    }
  },
  EnvFollowState
> = {
  id: 'envfollow',
  name: 'env flw',
  category: 'dynamics',
  width: 2,
  height: 3,

  inputs: {
    in: { type: 'audio', default: 0, label: 'in' },
  },
  outputs: {
    out: { type: 'cv', default: 0, label: 'out' },
  },
  params: {
    attack: {
      type: 'float',
      min: 0.001,
      max: 0.5,
      default: 0.01,
      label: 'atk',
      unit: 's',
    },
    release: {
      type: 'float',
      min: 0.001,
      max: 2,
      default: 0.1,
      label: 'rel',
      unit: 's',
    },
  },

  initialize(): EnvFollowState {
    return { envelope: 0 }
  },

  process(inputs, outputs, params, state, context) {
    const atkCoeff =
      1 - Math.exp(-1 / Math.max(1, params.attack * context.sampleRate))
    const relCoeff =
      1 - Math.exp(-1 / Math.max(1, params.release * context.sampleRate))
    for (let i = 0; i < 128; i++) {
      const abs = Math.abs(inputs.in[i] ?? 0)
      const coeff = abs > state.envelope ? atkCoeff : relCoeff
      state.envelope += (abs - state.envelope) * coeff
      outputs.out[i] = state.envelope
    }
  },
}
