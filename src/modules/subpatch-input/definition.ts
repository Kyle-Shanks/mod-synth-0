import type { ModuleDefinition } from '../../engine/types'

// Proxy module used inside a subpatch to expose an input port on the container face.
// The `data.label` field sets the displayed port name on the container.
// The `data.portType` field sets the signal type (audio/cv/gate/trigger).
// This module is only visible in the command palette when inside a subpatch.

interface SubpatchInputState {
  [key: string]: unknown
}

export const SubpatchInputDefinition: ModuleDefinition<
  { in: { type: 'cv'; default: 0; label: 'in'; hidden: true } },
  { out: { type: 'cv'; default: 0; label: 'out' } },
  Record<string, never>,
  SubpatchInputState
> = {
  id: 'subpatch-input',
  name: 'in',
  category: 'subpatch',
  internal: true,
  width: 2,
  height: 4,

  inputs: {
    in: { type: 'cv', default: 0, label: 'in', hidden: true },
  },
  outputs: {
    out: { type: 'cv', default: 0, label: 'out' },
  },
  params: {},

  initialize(): SubpatchInputState {
    return {}
  },

  process(inputs, outputs) {
    for (let i = 0; i < 128; i++) {
      outputs.out[i] = inputs.in[i] ?? 0
    }
  },
}
