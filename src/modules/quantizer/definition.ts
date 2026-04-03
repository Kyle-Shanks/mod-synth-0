import type { ModuleDefinition } from '../../engine/types'

interface QuantizerState {
  heldNote: number
  prevTrigLevel: number
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
    trig: { type: 'trigger'; default: 0; label: 'trig' }
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
    trig: { type: 'trigger', default: 0, label: 'trig' },
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
    return { heldNote: 0, prevTrigLevel: 0 }
  },

  process(inputs, outputs, params, state) {
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

    // find the nearest note in the scale for a given v/oct cv value
    function quantizeNote(cv: number): number {
      const semitones = cv * 12
      const octave = Math.floor(semitones / 12)
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
      return bestNote / 12
    }

    // detect rising edge in trig input (for sample-and-hold mode)
    let prevLevel = state.prevTrigLevel
    let triggered = false
    let trigSampleIndex = -1

    for (let i = 0; i < 128; i++) {
      const curr = inputs.trig[i] ?? 0
      if (curr > 0.5 && prevLevel <= 0.5) {
        triggered = true
        trigSampleIndex = i
      }
      prevLevel = curr
    }
    state.prevTrigLevel = prevLevel

    if (triggered && trigSampleIndex >= 0) {
      // sample-and-hold mode: quantize the cv value at the trigger point
      const cv = inputs.input[trigSampleIndex] ?? 0
      state.heldNote = quantizeNote(cv)
    } else if (!triggered) {
      // continuous mode: average input over the buffer, then quantize.
      // averaging prevents audio-rate signals from wave-shaping the output —
      // a sine wave averages near zero, so the quantizer outputs a stable
      // note rather than stepping through scale degrees every sample.
      let cvSum = 0
      for (let i = 0; i < 128; i++) cvSum += inputs.input[i] ?? 0
      state.heldNote = quantizeNote(cvSum / 128)
    }

    // output a constant quantized note for the entire buffer
    outputs.out.fill(state.heldNote)
  },
}
