import type { ModuleDefinition } from '../../engine/types'

interface TunerState {
  accumBuffer: Float32Array | null
  linearBuffer: Float32Array | null
  downsampleBuffer: Float32Array | null
  cmndfBuffer: Float32Array | null
  accumPos: number
  accumFill: number
  samplesSinceDetect: number
  tunerBuffer: Float32Array | null
  smoothedFreq: number
  smoothedClarity: number
  hasSmoothedReading: boolean
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
  height: 4,

  inputs: {
    in: { type: 'audio', default: 0, label: 'in' },
  },
  outputs: {},
  params: {},

  initialize(): TunerState {
    return {
      accumBuffer: null,
      linearBuffer: null,
      downsampleBuffer: null,
      cmndfBuffer: null,
      accumPos: 0,
      accumFill: 0,
      samplesSinceDetect: 0,
      tunerBuffer: null,
      smoothedFreq: 0,
      smoothedClarity: 0,
      hasSmoothedReading: false,
      initialized: false,
    }
  },

  process(inputs, _outputs, _params, state, context) {
    const TUNER_WINDOW = 2048
    const TUNER_DOWNSAMPLE = 2
    const TUNER_WINDOW_DS = TUNER_WINDOW / TUNER_DOWNSAMPLE
    const TUNER_DETECT_INTERVAL = 1024
    const sr = context.sampleRate

    if (!state.initialized) {
      state.accumBuffer = new Float32Array(TUNER_WINDOW)
      state.linearBuffer = new Float32Array(TUNER_WINDOW)
      state.downsampleBuffer = new Float32Array(TUNER_WINDOW_DS)
      state.cmndfBuffer = new Float32Array(TUNER_WINDOW_DS)
      state.accumPos = 0
      state.accumFill = 0
      state.samplesSinceDetect = 0
      state.smoothedFreq = 0
      state.smoothedClarity = 0
      state.hasSmoothedReading = false
      state.initialized = true
    }

    const accumBuffer = state.accumBuffer as Float32Array
    const linearBuffer = state.linearBuffer as Float32Array
    const downsampleBuffer = state.downsampleBuffer as Float32Array
    const cmndfBuffer = state.cmndfBuffer as Float32Array
    let accumPos = state.accumPos as number
    let accumFill = state.accumFill as number
    let samplesSinceDetect = state.samplesSinceDetect as number
    const tunerBuffer = state.tunerBuffer as Float32Array | null
    let smoothedFreq = state.smoothedFreq as number
    let smoothedClarity = state.smoothedClarity as number
    let hasSmoothedReading = state.hasSmoothedReading as boolean

    const connectedInputs = state._connectedInputs as
      | Record<string, boolean>
      | undefined
    const inputConnected = connectedInputs ? connectedInputs.in === true : true

    if (!inputConnected) {
      state.accumPos = 0
      state.accumFill = 0
      state.samplesSinceDetect = 0
      state.smoothedFreq = 0
      state.smoothedClarity = 0
      state.hasSmoothedReading = false
      if (tunerBuffer) {
        tunerBuffer[0] = 0
        tunerBuffer[1] = 0
      }
      return
    }

    for (let i = 0; i < 128; i++) {
      accumBuffer[accumPos] = inputs.in[i] ?? 0
      accumPos++
      if (accumPos >= TUNER_WINDOW) accumPos = 0
    }
    accumFill = Math.min(TUNER_WINDOW, accumFill + 128)
    samplesSinceDetect += 128

    if (samplesSinceDetect >= TUNER_DETECT_INTERVAL && tunerBuffer) {
      samplesSinceDetect = 0

      // Linearize ring buffer into oldest->newest contiguous data.
      let peak = 0
      const tail = TUNER_WINDOW - accumPos
      for (let i = 0; i < tail; i++) {
        const sample = accumBuffer[accumPos + i] ?? 0
        linearBuffer[i] = sample
        const abs = Math.abs(sample)
        if (abs > peak) peak = abs
      }
      for (let i = 0; i < accumPos; i++) {
        const sample = accumBuffer[i] ?? 0
        const dst = tail + i
        linearBuffer[dst] = sample
        const abs = Math.abs(sample)
        if (abs > peak) peak = abs
      }

      if (accumFill < TUNER_WINDOW || peak < 1e-4) {
        hasSmoothedReading = false
        smoothedFreq = 0
        smoothedClarity = 0
        tunerBuffer[0] = 0
        tunerBuffer[1] = 0
      } else {
        let mean = 0
        for (let i = 0; i < TUNER_WINDOW; i++) mean += linearBuffer[i] ?? 0
        mean /= TUNER_WINDOW

        // Remove dc and downsample-by-2 to reduce detector CPU in large patches.
        for (let i = 0; i < TUNER_WINDOW_DS; i++) {
          const a = (linearBuffer[i * 2] ?? 0) - mean
          const b = (linearBuffer[i * 2 + 1] ?? 0) - mean
          downsampleBuffer[i] = (a + b) * 0.5
        }

        const effectiveSampleRate = sr / TUNER_DOWNSAMPLE
        const tauMin = Math.max(1, Math.floor(effectiveSampleRate / 2000))
        const tauMax = Math.min(
          TUNER_WINDOW_DS - 1,
          Math.floor(effectiveSampleRate / 50),
        )
        const searchLen = TUNER_WINDOW_DS - tauMax

        let runningSum = 0
        cmndfBuffer[0] = 1

        for (let tau = 1; tau <= tauMax; tau++) {
          let d = 0
          for (let j = 0; j < searchLen; j++) {
            const diff =
              (downsampleBuffer[j] ?? 0) - (downsampleBuffer[j + tau] ?? 0)
            d += diff * diff
          }
          runningSum += d
          cmndfBuffer[tau] = runningSum > 1e-12 ? (d * tau) / runningSum : 1
        }

        let foundTau = -1
        let foundCMNDF = 1
        const threshold = 0.15

        for (let tau = tauMin; tau <= tauMax; tau++) {
          const cmndf = cmndfBuffer[tau] ?? 1
          if (cmndf < threshold) {
            while (
              tau < tauMax &&
              (cmndfBuffer[tau + 1] ?? 1) < (cmndfBuffer[tau] ?? 1)
            ) {
              tau++
            }
            foundTau = tau
            foundCMNDF = cmndfBuffer[tau] ?? cmndf
            break
          }
        }

        if (foundTau < 0) {
          let bestTau = tauMin
          let bestCMNDF = cmndfBuffer[tauMin] ?? 1
          for (let tau = tauMin + 1; tau <= tauMax; tau++) {
            const cmndf = cmndfBuffer[tau] ?? 1
            if (cmndf < bestCMNDF) {
              bestCMNDF = cmndf
              bestTau = tau
            }
          }
          if (bestCMNDF < 0.35) {
            foundTau = bestTau
            foundCMNDF = bestCMNDF
          }
        }

        let freq = 0
        let clarity = 0
        if (foundTau > 0) {
          const t0 = foundTau
          const tPrev = t0 > tauMin ? t0 - 1 : t0
          const tNext = t0 < tauMax ? t0 + 1 : t0
          const yPrev = cmndfBuffer[tPrev] ?? 1
          const yCurr = cmndfBuffer[t0] ?? 1
          const yNext = cmndfBuffer[tNext] ?? 1
          const denom = yPrev - 2 * yCurr + yNext
          const refinedTau =
            denom !== 0 ? t0 + (yPrev - yNext) / (2 * denom) : t0
          if (refinedTau > 0) {
            freq = effectiveSampleRate / refinedTau
            clarity = 1 - foundCMNDF
          }
        }

        if (freq > 0 && Number.isFinite(freq) && clarity > 0) {
          if (!hasSmoothedReading) {
            smoothedFreq = freq
            smoothedClarity = clarity
            hasSmoothedReading = true
          } else {
            smoothedFreq += (freq - smoothedFreq) * 0.2
            smoothedClarity += (clarity - smoothedClarity) * 0.3
          }
          tunerBuffer[0] = smoothedFreq
          tunerBuffer[1] = smoothedClarity
        } else {
          hasSmoothedReading = false
          smoothedFreq = 0
          smoothedClarity = 0
          tunerBuffer[0] = 0
          tunerBuffer[1] = 0
        }
      }
    }

    state.accumPos = accumPos
    state.accumFill = accumFill
    state.samplesSinceDetect = samplesSinceDetect
    state.smoothedFreq = smoothedFreq
    state.smoothedClarity = smoothedClarity
    state.hasSmoothedReading = hasSmoothedReading
  },
}
