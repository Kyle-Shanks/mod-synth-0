import type { ModuleDefinition } from '../../engine/types'

interface TunerState {
  accumBuffer: Float32Array | null
  accumPos: number
  samplesSinceDetect: number
  tunerBuffer: Float32Array | null
  initialized: boolean
  [key: string]: unknown
}

export const TunerDefinition: ModuleDefinition<
  { in: { type: 'audio'; default: 0; label: 'in' } },
  Record<string, never>,
  Record<string, never>,
  TunerState
> = {
  id: 'tuner',
  name: 'tuner',
  category: 'display',
  width: 4,
  height: 5,

  inputs: {
    in: { type: 'audio', default: 0, label: 'in' },
  },
  outputs: {},
  params: {},

  initialize(): TunerState {
    return {
      accumBuffer: null,
      accumPos: 0,
      samplesSinceDetect: 0,
      tunerBuffer: null,
      initialized: false,
    }
  },

  process(inputs, _outputs, _params, state, context) {
    const sr = context.sampleRate

    if (!state.initialized) {
      state.accumBuffer = new Float32Array(2048)
      state.accumPos = 0
      state.samplesSinceDetect = 0
      state.initialized = true
    }

    const accumBuffer = state.accumBuffer as Float32Array
    let accumPos = state.accumPos as number
    let samplesSinceDetect = state.samplesSinceDetect as number
    const tunerBuffer = state.tunerBuffer as Float32Array | null

    for (let i = 0; i < 128; i++) {
      accumBuffer[accumPos % 2048] = inputs.in[i] ?? 0
      accumPos++
    }
    samplesSinceDetect += 128

    if (samplesSinceDetect >= 512 && tunerBuffer) {
      samplesSinceDetect = 0

      function yinDetect(buf, sampleRate) {
        const bufLen = buf.length
        const tauMin = Math.max(1, Math.floor(sampleRate / 4000))
        const tauMax = Math.floor(sampleRate / 40)
        const searchLen = bufLen - tauMax

        if (searchLen <= 0) { return [0, 0] }

        // precompute d(tau) for all tau in range and find CMNDF minimum
        let runningSum = 0
        let foundTau = -1
        let foundCMNDF = 1

        for (let tau = 1; tau <= tauMax; tau++) {
          let d = 0
          for (let j = 0; j < searchLen; j++) {
            const diff = buf[j] - buf[(j + tau) % bufLen]
            d += diff * diff
          }
          runningSum += d
          const cmndf = (d * tau) / runningSum

          if (tau >= tauMin && cmndf < 0.1) {
            foundTau = tau
            foundCMNDF = cmndf
            break
          }
        }

        if (foundTau < 0) { return [0, 0] }

        // parabolic interpolation using d values
        function dAt(tau) {
          let d = 0
          for (let j = 0; j < searchLen; j++) {
            const diff = buf[j] - buf[(j + tau) % bufLen]
            d += diff * diff
          }
          return d
        }

        const t0 = foundTau
        const tPrev = t0 > tauMin ? t0 - 1 : t0
        const tNext = t0 < tauMax ? t0 + 1 : t0
        const dPrev = dAt(tPrev)
        const dCurr = dAt(t0)
        const dNext = dAt(tNext)
        const denom = dPrev - 2 * dCurr + dNext
        const refinedTau = denom !== 0 ? t0 + (dPrev - dNext) / (2 * denom) : t0

        const freq = sampleRate / refinedTau
        const clarity = 1 - foundCMNDF
        return [freq, clarity]
      }

      const result = yinDetect(accumBuffer, sr)
      tunerBuffer[0] = result[0]
      tunerBuffer[1] = result[1]
    }

    state.accumPos = accumPos % 2048
    state.samplesSinceDetect = samplesSinceDetect
  },
}
