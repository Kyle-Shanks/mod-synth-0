import type { ModuleDefinition } from '../../engine/types'

// Proxy module used inside a subpatch to expose an output port on the container face.
// The `data.label` field sets the displayed port name on the container.
// The `data.portType` field sets the signal type (audio/cv/gate/trigger).
// This module is only visible in the command palette when inside a subpatch.

interface SubpatchOutputState {
  [key: string]: unknown
}

export const SubpatchOutputDefinition: ModuleDefinition<
  { in: { type: 'cv'; default: 0; label: 'in' } },
  { out: { type: 'cv'; default: 0; label: 'out'; hidden: true } },
  Record<string, never>,
  SubpatchOutputState
> = {
  id: 'subpatch-output',
  name: 'out',
  category: 'subpatch',
  internal: true,
  width: 2,
  height: 4,

  inputs: {
    in: { type: 'cv', default: 0, label: 'in' },
  },
  outputs: {
    out: { type: 'cv', default: 0, label: 'out', hidden: true },
  },
  params: {},

  initialize(): SubpatchOutputState {
    return {}
  },

  process(inputs, outputs) {
    for (let i = 0; i < 128; i++) {
      outputs.out[i] = inputs.in[i] ?? 0
    }
  },
}
