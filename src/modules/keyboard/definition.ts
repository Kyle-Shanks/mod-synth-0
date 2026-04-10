import type { ModuleDefinition } from '../../engine/types'

interface KeyboardEvent {
  offset: number
  value: number
  portId: string
}

interface KeyboardState {
  activeNotes: number[]
  currentCv: number
  triggerSamplesRemaining: number
  _gateEvents: KeyboardEvent[]
  [key: string]: unknown
}

export const KeyboardDefinition: ModuleDefinition<
  Record<string, never>,
  {
    cv: { type: 'cv'; default: 0; label: 'out' }
    gate: { type: 'gate'; default: 0; label: 'gate' }
    trigger: { type: 'trigger'; default: 0; label: 'trig' }
  },
  Record<string, never>,
  KeyboardState
> = {
  id: 'keyboard',
  name: 'keyboard',
  category: 'control',
  width: 5,
  height: 4,

  inputs: {},
  outputs: {
    cv: { type: 'cv', default: 0, label: 'out' },
    gate: { type: 'gate', default: 0, label: 'gate' },
    trigger: { type: 'trigger', default: 0, label: 'trig' },
  },
  params: {},

  initialize(): KeyboardState {
    return {
      activeNotes: [],
      currentCv: 0,
      triggerSamplesRemaining: 0,
      _gateEvents: [],
    }
  },

  process(_inputs, outputs, _params, state, context) {
    const triggerDuration = Math.round(context.sampleRate * 0.004) // 4ms pulse
    const events = state._gateEvents as KeyboardEvent[]

    // preserve sample-accurate order from worklet command offsets
    events.sort((a, b) => a.offset - b.offset)

    const activeNotes = state.activeNotes as number[]
    let eventIdx = 0

    for (let i = 0; i < 128; i++) {
      while (eventIdx < events.length && (events[eventIdx]?.offset ?? 0) <= i) {
        const evt = events[eventIdx]!
        let note: number | null = null
        if (evt.portId.startsWith('note:')) {
          const parsed = Number.parseInt(evt.portId.slice(5), 10)
          if (Number.isFinite(parsed)) note = parsed
        }

        if (note !== null) {
          if (evt.value > 0) {
            // Last-note priority: move repeated note-ons to the end.
            const existingIdx = activeNotes.indexOf(note)
            if (existingIdx >= 0) activeNotes.splice(existingIdx, 1)
            activeNotes.push(note)
            state.triggerSamplesRemaining = triggerDuration
          } else {
            const existingIdx = activeNotes.indexOf(note)
            if (existingIdx >= 0) activeNotes.splice(existingIdx, 1)
          }

          const nextNoteIndex = activeNotes.length - 1
          if (nextNoteIndex >= 0) {
            const nextNote = activeNotes[nextNoteIndex]
            if (nextNote !== undefined) {
              state.currentCv = (nextNote - 60) / 12
            }
          }
        }
        eventIdx++
      }

      outputs.cv[i] = state.currentCv as number
      outputs.gate[i] = activeNotes.length > 0 ? 1 : 0

      if (state.triggerSamplesRemaining > 0) {
        outputs.trigger[i] = 1
        state.triggerSamplesRemaining--
      } else {
        outputs.trigger[i] = 0
      }
    }

    state._gateEvents = []
  },
}
