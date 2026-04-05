import type { ModuleDefinition } from '../../engine/types'

interface ChordGenState {
  [key: string]: unknown
}

export const ChordGenDefinition: ModuleDefinition<
  {
    root: { type: 'cv'; default: 0; label: 'root' }
  },
  {
    v1: { type: 'cv'; default: 0; label: 'v1' }
    v2: { type: 'cv'; default: 0; label: 'v2' }
    v3: { type: 'cv'; default: 0; label: 'v3' }
    v4: { type: 'cv'; default: 0; label: 'v4' }
  },
  {
    chord: {
      type: 'select'
      default: 0
      label: 'chord'
      options: [
        'maj',
        'min',
        'dom7',
        'maj7',
        'min7',
        'dim',
        'aug',
        'sus2',
        'sus4',
      ]
    }
    octave: { type: 'float'; min: -2; max: 2; default: 0; label: 'oct' }
    spread: { type: 'float'; min: 0; max: 2; default: 0; label: 'spread' }
  },
  ChordGenState
> = {
  id: 'chordgen',
  name: 'chord',
  category: 'utility',
  width: 4,
  height: 6,

  inputs: {
    root: { type: 'cv', default: 0, label: 'root' },
  },
  outputs: {
    v1: { type: 'cv', default: 0, label: 'v1' },
    v2: { type: 'cv', default: 0, label: 'v2' },
    v3: { type: 'cv', default: 0, label: 'v3' },
    v4: { type: 'cv', default: 0, label: 'v4' },
  },
  params: {
    chord: {
      type: 'select',
      default: 0,
      label: 'chord',
      options: [
        'maj',
        'min',
        'dom7',
        'maj7',
        'min7',
        'dim',
        'aug',
        'sus2',
        'sus4',
      ],
    },
    octave: { type: 'float', min: -2, max: 2, default: 0, label: 'oct' },
    spread: { type: 'float', min: 0, max: 2, default: 0, label: 'spread' },
  },

  initialize(): ChordGenState {
    return {}
  },

  process(inputs, outputs, params, _state, _context) {
    // chord interval table in semitones: [root, third, fifth, octave/seventh]
    const chordTable = [
      [0, 4, 7, 12], // maj
      [0, 3, 7, 12], // min
      [0, 4, 7, 10], // dom7
      [0, 4, 7, 11], // maj7
      [0, 3, 7, 10], // min7
      [0, 3, 6, 9], // dim
      [0, 4, 8, 12], // aug
      [0, 2, 7, 12], // sus2
      [0, 5, 7, 12], // sus4
    ]

    const chordIdx = Math.max(0, Math.min(8, Math.round(params.chord)))
    const rawIntervals = chordTable[chordIdx] ?? [0, 4, 7, 12]
    const i0 = rawIntervals[0] ?? 0
    const i1 = rawIntervals[1] ?? 4
    const i2 = rawIntervals[2] ?? 7
    const i3 = rawIntervals[3] ?? 12
    const octaveOffset = Math.round(params.octave)
    const spread = params.spread // extra octave spread per voice

    for (let i = 0; i < 128; i++) {
      const root = (inputs.root[i] ?? 0) + octaveOffset
      outputs.v1[i] = root + i0 / 12
      outputs.v2[i] = root + i1 / 12
      outputs.v3[i] = root + i2 / 12 + spread * 0.5
      outputs.v4[i] = root + i3 / 12 + spread * 1
    }
  },
}
