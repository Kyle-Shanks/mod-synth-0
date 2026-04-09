import type { ModuleDefinition } from '../../engine/types'

interface GateEvent {
  offset: number
  value: number
  portId: string
}

interface ChordDiceState {
  currentChord: number
  clockWasHigh: boolean
  rngSeed: number
  degreeSemitones: number[]
  progressionDegrees: number[]
  progressionChromaticOffsets: number[]
  progressionQualities: number[]
  progressionInversions: number[]
  progressionOctaveOffsets: number[]
  _gateEvents: GateEvent[]
  [key: string]: unknown
}

export const ChordDiceDefinition: ModuleDefinition<
  {
    clock: { type: 'trigger'; default: 0; label: 'clock' }
    root: { type: 'cv'; default: 0; label: 'root' }
  },
  {
    v1: { type: 'cv'; default: 0; label: 'v1' }
    v2: { type: 'cv'; default: 0; label: 'v2' }
    v3: { type: 'cv'; default: 0; label: 'v3' }
    v4: { type: 'cv'; default: 0; label: 'v4' }
  },
  Record<string, never>,
  ChordDiceState
> = {
  id: 'chorddice',
  name: 'chord dice',
  category: 'control',
  width: 3,
  height: 4,

  inputs: {
    clock: { type: 'trigger', default: 0, label: 'clock' },
    root: { type: 'cv', default: 0, label: 'root' },
  },
  outputs: {
    v1: { type: 'cv', default: 0, label: 'v1' },
    v2: { type: 'cv', default: 0, label: 'v2' },
    v3: { type: 'cv', default: 0, label: 'v3' },
    v4: { type: 'cv', default: 0, label: 'v4' },
  },
  params: {},

  initialize(): ChordDiceState {
    const seed = Math.floor(Math.random() * 0xffffffff) >>> 0 || 1
    return {
      currentChord: 0,
      clockWasHigh: false,
      rngSeed: seed,
      degreeSemitones: [0, 2, 4, 5, 7, 9, 11],
      progressionDegrees: [0, 4, 5, 3],
      progressionChromaticOffsets: [0, 0, 0, 0],
      progressionQualities: [0, 2, 1, 0],
      progressionInversions: [0, 1, 2, 1],
      progressionOctaveOffsets: [0, 0, 0, 0],
      // force an initial shuffle so each new instance starts with a fresh progression
      _gateEvents: [{ offset: 0, value: 1, portId: 'shuffle' }],
    }
  },

  process(inputs, outputs, _params, state) {
    const events = state._gateEvents as GateEvent[]
    const degreeSemitones = state.degreeSemitones
    const progressionDegrees = state.progressionDegrees
    const progressionChromaticOffsets = state.progressionChromaticOffsets
    const progressionQualities = state.progressionQualities
    const progressionInversions = state.progressionInversions
    const progressionOctaveOffsets = state.progressionOctaveOffsets

    events.sort((a, b) => a.offset - b.offset)

    let eventIdx = 0
    let seed = state.rngSeed >>> 0
    const progressionLength = 4

    const nextRandomUnit = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }

    const nextRandomInt = (maxExclusive: number) => {
      return Math.floor(nextRandomUnit() * maxExclusive)
    }

    const normalizeDegree = (degree: number) => {
      return ((degree % 7) + 7) % 7
    }

    const defaultQualityForDegree = (degree: number) => {
      if (degree === 0 || degree === 3) return 0 // maj7
      if (degree === 4) return 2 // dom7
      if (degree === 6) return 3 // dim7
      return 1 // min7
    }

    const setStep = (
      step: number,
      degree: number,
      chromaticOffset: number,
      quality: number,
      inversion: number,
      octaveOffset: number,
    ) => {
      progressionDegrees[step] = normalizeDegree(degree)
      progressionChromaticOffsets[step] = chromaticOffset
      progressionQualities[step] = quality
      progressionInversions[step] = Math.max(0, Math.min(3, inversion))
      progressionOctaveOffsets[step] = Math.max(-1, Math.min(1, octaveOffset))
    }

    const applyPattern = (pattern: number) => {
      switch (pattern) {
        case 0: // I-V-vi-IV
          setStep(0, 0, 0, 0, 0, 0)
          setStep(1, 4, 0, 2, 1, 0)
          setStep(2, 5, 0, 1, 1, 0)
          setStep(3, 3, 0, 0, 2, 0)
          break
        case 1: // vi-IV-I-V
          setStep(0, 5, 0, 1, 0, 0)
          setStep(1, 3, 0, 0, 1, 0)
          setStep(2, 0, 0, 0, 0, 0)
          setStep(3, 4, 0, 2, 2, 0)
          break
        case 2: // ii-V-I-vi
          setStep(0, 1, 0, 1, 0, 0)
          setStep(1, 4, 0, 2, 2, 0)
          setStep(2, 0, 0, 0, 0, 0)
          setStep(3, 5, 0, 1, 1, 0)
          break
        case 3: // I-III7-vi-II7
          setStep(0, 0, 0, 0, 0, 0)
          setStep(1, 2, 0, 2, 1, 0)
          setStep(2, 5, 0, 1, 1, 0)
          setStep(3, 1, 0, 2, 2, 0)
          break
        case 4: // I-#Idim-ii-V
          setStep(0, 0, 0, 0, 0, 0)
          setStep(1, 0, 1, 3, 0, 0)
          setStep(2, 1, 0, 1, 1, 0)
          setStep(3, 4, 0, 2, 2, 0)
          break
        case 5: // i-bVI-bVII-V
          setStep(0, 0, 0, 4, 0, 0)
          setStep(1, 5, -1, 0, 1, 0)
          setStep(2, 6, -1, 2, 1, 0)
          setStep(3, 4, -1, 1, 2, 0)
          break
        case 6: // I-II-IV-bII
          setStep(0, 0, 0, 0, 0, 0)
          setStep(1, 1, 0, 0, 1, 0)
          setStep(2, 3, 0, 5, 2, 0)
          setStep(3, 1, -1, 0, 1, 0)
          break
        case 7: // quartal motion
          setStep(0, 0, 0, 9, 0, 0)
          setStep(1, 3, 0, 7, 1, 0)
          setStep(2, 6, -1, 9, 2, 0)
          setStep(3, 4, 0, 2, 1, 0)
          break
        case 8: // chromatic mediants
          setStep(0, 0, 0, 0, 0, 0)
          setStep(1, 2, -1, 0, 0, 0)
          setStep(2, 5, -1, 0, 1, 0)
          setStep(3, 4, 0, 2, 2, 0)
          break
        case 9: // tritone side-slip
          setStep(0, 0, 0, 0, 0, 0)
          setStep(1, 1, -1, 2, 1, 0)
          setStep(2, 4, 0, 0, 2, 0)
          setStep(3, 4, -1, 2, 1, 0)
          break
        case 10: // suspended lift
          setStep(0, 0, 0, 6, 0, 0)
          setStep(1, 3, 0, 7, 1, 0)
          setStep(2, 1, 0, 1, 2, 0)
          setStep(3, 4, 0, 2, 1, 0)
          break
        case 11: // augmented portal
          setStep(0, 0, 0, 8, 0, 0)
          setStep(1, 2, 0, 1, 1, 0)
          setStep(2, 5, -1, 8, 1, 0)
          setStep(3, 4, 0, 2, 2, 0)
          break
        case 12: // open fifth climb
          setStep(0, 0, 0, 11, 0, 0)
          setStep(1, 1, 0, 11, 1, 0)
          setStep(2, 3, 0, 5, 2, 0)
          setStep(3, 4, 0, 2, 1, 0)
          break
        case 13: // cluster drift
          setStep(0, 0, 0, 10, 0, 0)
          setStep(1, 1, -1, 10, 1, 0)
          setStep(2, 3, 0, 10, 2, 0)
          setStep(3, 4, 0, 2, 2, 0)
          break
        case 14: // whole-tone wash
          setStep(0, 0, 0, 12, 0, 0)
          setStep(1, 2, 0, 12, 1, 0)
          setStep(2, 3, 1, 12, 2, 0)
          setStep(3, 6, -1, 2, 1, 0)
          break
        case 15: // neo-soul loop
          setStep(0, 0, 0, 5, 1, 0)
          setStep(1, 2, -1, 0, 2, 0)
          setStep(2, 5, 0, 1, 0, 0)
          setStep(3, 4, 0, 2, 1, 0)
          break
        case 16: // backdoor cadence
          setStep(0, 0, 0, 0, 0, 0)
          setStep(1, 1, 0, 1, 1, 0)
          setStep(2, 6, -1, 2, 2, 0)
          setStep(3, 0, 0, 5, 0, 0)
          break
        case 17: // descending cinematic
          setStep(0, 0, 0, 0, 0, 0)
          setStep(1, 6, -1, 0, 1, 0)
          setStep(2, 5, -1, 1, 2, 0)
          setStep(3, 4, -1, 2, 1, 0)
          break
        case 18: // floating minor clouds
          setStep(0, 0, 0, 4, 0, 0)
          setStep(1, 3, -1, 13, 1, 0)
          setStep(2, 5, -1, 0, 2, 0)
          setStep(3, 4, -1, 1, 1, 0)
          break
        default: // tuned default
          setStep(0, 0, 0, 0, 0, 0)
          setStep(1, 4, 0, 2, 1, 0)
          setStep(2, 1, 0, 1, 2, 0)
          setStep(3, 5, 0, 5, 1, 0)
          break
      }
    }

    for (let i = 0; i < 128; i++) {
      let shuffledThisSample = false

      // process UI shuffle events at sample-accurate offsets
      while (eventIdx < events.length && (events[eventIdx]?.offset ?? 0) <= i) {
        const evt = events[eventIdx]!
        if (evt.portId === 'shuffle' && evt.value > 0) {
          const strategy = nextRandomInt(4)

          if (strategy === 0) {
            applyPattern(nextRandomInt(19))
          } else if (strategy === 1) {
            applyPattern(nextRandomInt(19))
            for (let step = 0; step < progressionLength; step++) {
              if (nextRandomInt(100) < 45) {
                progressionInversions[step] = nextRandomInt(4)
              }
              if (nextRandomInt(100) < 35) {
                let chromatic =
                  (progressionChromaticOffsets[step] ?? 0) +
                  (nextRandomInt(3) - 1)
                if (chromatic > 2) chromatic = 2
                if (chromatic < -2) chromatic = -2
                progressionChromaticOffsets[step] = chromatic
              }
              if (nextRandomInt(100) < 30) {
                progressionOctaveOffsets[step] = nextRandomInt(3) - 1
              }
              if (nextRandomInt(100) < 40) {
                progressionQualities[step] = nextRandomInt(14)
              }
            }
          } else {
            let currentDegree = 0
            let currentOctave = 0

            for (let step = 0; step < progressionLength; step++) {
              if (step > 0) {
                const leapChoice = nextRandomInt(8)
                let leap = 4
                if (leapChoice === 0) leap = 1
                else if (leapChoice === 1) leap = 2
                else if (leapChoice === 2) leap = 3
                else if (leapChoice === 3) leap = 4
                else if (leapChoice === 4) leap = 5
                else if (leapChoice === 5) leap = 6
                else if (leapChoice === 6) leap = 0
                else leap = 4
                currentDegree = normalizeDegree(currentDegree + leap)
              }

              let chromaticOffset = 0
              if (strategy === 2) {
                const chromaRoll = nextRandomInt(10)
                if (chromaRoll === 0) chromaticOffset = -1
                else if (chromaRoll === 1) chromaticOffset = 1
                else if (chromaRoll === 2) chromaticOffset = -2
                else if (chromaRoll === 3) chromaticOffset = 2
                else chromaticOffset = 0
              } else {
                const chromaRoll = nextRandomInt(12)
                if (chromaRoll <= 1) chromaticOffset = -2
                else if (chromaRoll <= 3) chromaticOffset = -1
                else if (chromaRoll <= 5) chromaticOffset = 1
                else if (chromaRoll <= 7) chromaticOffset = 2
                else chromaticOffset = 0
              }

              let quality = defaultQualityForDegree(currentDegree)
              if (
                chromaticOffset !== 0 ||
                nextRandomInt(100) < (strategy === 3 ? 70 : 35)
              ) {
                if (strategy === 3) {
                  quality = 8 + nextRandomInt(6) // emphasize exotic colors
                } else {
                  quality = nextRandomInt(14)
                }
              }

              if (nextRandomInt(100) < (strategy === 3 ? 45 : 25)) {
                const octaveDelta = nextRandomInt(2) === 0 ? -1 : 1
                currentOctave += octaveDelta
                if (currentOctave > 1) currentOctave = 1
                if (currentOctave < -1) currentOctave = -1
              }

              setStep(
                step,
                currentDegree,
                chromaticOffset,
                quality,
                nextRandomInt(4),
                currentOctave,
              )
            }
          }

          state.currentChord = 0
          shuffledThisSample = true
        }
        eventIdx++
      }

      const clockHigh = (inputs.clock[i] ?? 0) > 0.5
      if (clockHigh && !state.clockWasHigh && !shuffledThisSample) {
        state.currentChord = (state.currentChord + 1) % 4
      }
      state.clockWasHigh = clockHigh

      const chordStep = state.currentChord % 4
      const degree = normalizeDegree(progressionDegrees[chordStep] ?? 0)
      const chromaticOffset = progressionChromaticOffsets[chordStep] ?? 0
      const quality = progressionQualities[chordStep] ?? 0
      const inversion = progressionInversions[chordStep] ?? 0
      const octaveOffset = progressionOctaveOffsets[chordStep] ?? 0
      const degreeOffset =
        ((degreeSemitones[degree] ?? 0) + chromaticOffset) / 12
      const root = (inputs.root[i] ?? 0) + degreeOffset + octaveOffset

      let interval1 = 0
      let interval2 = 4
      let interval3 = 7
      let interval4 = 11
      if (quality === 1) {
        interval2 = 3
        interval3 = 7
        interval4 = 10
      } else if (quality === 2) {
        interval2 = 4
        interval3 = 7
        interval4 = 10
      } else if (quality === 3) {
        interval2 = 3
        interval3 = 6
        interval4 = 9
      } else if (quality === 4) {
        interval2 = 3
        interval3 = 7
        interval4 = 11
      } else if (quality === 5) {
        interval2 = 4
        interval3 = 7
        interval4 = 9
      } else if (quality === 6) {
        interval2 = 2
        interval3 = 7
        interval4 = 10
      } else if (quality === 7) {
        interval2 = 5
        interval3 = 7
        interval4 = 10
      } else if (quality === 8) {
        interval2 = 4
        interval3 = 8
        interval4 = 11
      } else if (quality === 9) {
        interval2 = 5
        interval3 = 10
        interval4 = 15
      } else if (quality === 10) {
        interval2 = 1
        interval3 = 7
        interval4 = 10
      } else if (quality === 11) {
        interval2 = 7
        interval3 = 14
        interval4 = 16
      } else if (quality === 12) {
        interval2 = 4
        interval3 = 8
        interval4 = 10
      } else if (quality === 13) {
        interval2 = 3
        interval3 = 7
        interval4 = 17
      }

      if (inversion === 1) {
        const n1 = interval2
        const n2 = interval3
        const n3 = interval4
        const n4 = interval1 + 12
        interval1 = n1
        interval2 = n2
        interval3 = n3
        interval4 = n4
      } else if (inversion === 2) {
        const n1 = interval3
        const n2 = interval4
        const n3 = interval1 + 12
        const n4 = interval2 + 12
        interval1 = n1
        interval2 = n2
        interval3 = n3
        interval4 = n4
      } else if (inversion === 3) {
        const n1 = interval4
        const n2 = interval1 + 12
        const n3 = interval2 + 12
        const n4 = interval3 + 12
        interval1 = n1
        interval2 = n2
        interval3 = n3
        interval4 = n4
      }

      outputs.v1[i] = root + interval1 / 12
      outputs.v2[i] = root + interval2 / 12
      outputs.v3[i] = root + interval3 / 12
      outputs.v4[i] = root + interval4 / 12
    }

    state.rngSeed = seed >>> 0
    state._gateEvents = []
  },
}
