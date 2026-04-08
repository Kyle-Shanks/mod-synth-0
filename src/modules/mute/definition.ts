import type { ModuleDefinition } from '../../engine/types'

interface MuteState {
  [key: string]: unknown
}

export const MuteDefinition: ModuleDefinition<
  {
    in: { type: 'audio'; default: 0; label: 'in' }
  },
  {
    out: { type: 'audio'; default: 0; label: 'out' }
  },
  {
    mute: { type: 'boolean'; default: 0; label: 'mute' }
  },
  MuteState
> = {
  id: 'mute',
  name: 'mute',
  category: 'utility',
  width: 2,
  height: 3,

  inputs: {
    in: { type: 'audio', default: 0, label: 'in' },
  },
  outputs: {
    out: { type: 'audio', default: 0, label: 'out' },
  },
  params: {
    mute: { type: 'boolean', default: 0, label: 'mute' },
  },

  initialize(): MuteState {
    return {}
  },

  process(inputs, outputs, params) {
    const muted = (params.mute ?? 0) >= 0.5
    for (let i = 0; i < 128; i++) {
      outputs.out[i] = muted ? 0 : (inputs.in[i] ?? 0)
    }
  },
}
