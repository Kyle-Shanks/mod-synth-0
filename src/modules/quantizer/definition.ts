import type { ModuleDefinition } from '../../engine/types'

interface QuantizerState {
  [key: string]: unknown
}

// scale definitions as semitone offsets within an octave (0-11)
// these are inlined in process() to keep the function serializable
// chromatic: [0,1,2,3,4,5,6,7,8,9,10,11]
// major:     [0,2,4,5,7,9,11]
// minor:     [0,2,3,5,7,8,10]
// pentatonic:[0,2,4,7,9]
// blues:     [0,3,5,6,7,10]
// dorian:    [0,2,3,5,7,9,10]
// mixolydian:[0,2,4,5,7,9,10]

export const QuantizerDefinition: ModuleDefinition<
  {
    input: { type: 'cv'; default: 0; label: 'in' }
  },
  {
    out: { type: 'cv'; default: 0; label: 'out' }
  },
  {
    scale: {
      type: 'select'
      default: 0
      label: 'scale'
      options: [
        'chromatic',
        'major',
        'minor',
        'pentatonic',
        'blues',
        'dorian',
        'mixolydian',
      ]
    }
  },
  QuantizerState
> = {
  id: 'quantizer',
  name: 'quant',
  category: 'utility',
  width: 3,
  height: 5,

  inputs: {
    input: { type: 'cv', default: 0, label: 'in' },
  },
  outputs: {
    out: { type: 'cv', default: 0, label: 'out' },
  },
  params: {
    scale: {
      type: 'select',
      default: 0,
      label: 'scale',
      options: [
        'chromatic',
        'major',
        'minor',
        'pentatonic',
        'blues',
        'dorian',
        'mixolydian',
      ],
    },
  },

  initialize(): QuantizerState {
    return {}
  },

  process(inputs, outputs, params) {
    // scale semitone sets — must be inline, no closures
    const scales = [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], // chromatic
      [0, 2, 4, 5, 7, 9, 11], // major
      [0, 2, 3, 5, 7, 8, 10], // minor
      [0, 2, 4, 7, 9], // pentatonic
      [0, 3, 5, 6, 7, 10], // blues
      [0, 2, 3, 5, 7, 9, 10], // dorian
      [0, 2, 4, 5, 7, 9, 10], // mixolydian
    ]

    const scaleIdx = Math.max(
      0,
      Math.min(scales.length - 1, Math.round(params.scale)),
    )
    const scale = scales[scaleIdx]!

    for (let i = 0; i < 128; i++) {
      // input is v/oct: 0 = root (C4), +1 = octave up, etc.
      const cv = inputs.input[i] ?? 0

      // convert to semitones from root
      const semitones = cv * 12
      const octave = Math.floor(semitones / 12)

      // search current octave and neighbors for the absolute nearest scale note
      // this correctly handles boundary cases (e.g. 11.8 semitones → C of next octave)
      let bestNote = 0
      let bestDist = 100

      for (let o = -1; o <= 1; o++) {
        for (let s = 0; s < scale.length; s++) {
          const note = (octave + o) * 12 + scale[s]!
          const dist = Math.abs(semitones - note)
          if (dist < bestDist) {
            bestDist = dist
            bestNote = note
          }
        }
      }

      // convert back to v/oct
      outputs.out[i] = bestNote / 12
    }
  },
}
