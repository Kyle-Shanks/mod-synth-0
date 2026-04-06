import type { ModuleDefinition } from '../../engine/types'

interface NoteState {
  [key: string]: unknown
}

export const NoteDefinition: ModuleDefinition<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  NoteState
> = {
  id: 'note',
  name: 'note',
  category: 'utility',
  width: 4,
  height: 4,

  inputs: {},
  outputs: {},
  params: {},

  initialize(): NoteState {
    return {}
  },

  process() {
    // UI-only module: no DSP work required.
  },
}
