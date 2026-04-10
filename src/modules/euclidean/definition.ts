import type { ModuleDefinition } from '../../engine/types'

interface EuclideanState {
  pattern: null | number[]
  currentStep: number
  clockWasHigh: boolean
  outTimer: number
  accentTimer: number
  indicatorTimer: number
  _prevN: unknown
  _prevK: unknown
  _prevRot: unknown
  [key: string]: unknown
}

export const EuclideanDefinition: ModuleDefinition<
  {
    clock: { type: 'gate'; default: 0; label: 'clock' }
    reset: { type: 'trigger'; default: 0; label: 'reset' }
  },
  {
    out: { type: 'trigger'; default: 0; label: 'out' }
    accent: { type: 'trigger'; default: 0; label: 'acc' }
  },
  {
    steps: { type: 'int'; min: 1; max: 16; default: 8; label: 'n' }
    pulses: { type: 'int'; min: 0; max: 16; default: 3; label: 'k' }
    offset: { type: 'int'; min: 0; max: 15; default: 0; label: 'rot' }
  },
  EuclideanState
> = {
  id: 'euclidean',
  name: 'euclid',
  category: 'control',
  width: 4,
  height: 3,

  inputs: {
    clock: { type: 'gate', default: 0, label: 'clock' },
    reset: { type: 'trigger', default: 0, label: 'reset' },
  },
  outputs: {
    out: { type: 'trigger', default: 0, label: 'out' },
    accent: { type: 'trigger', default: 0, label: 'acc' },
  },
  params: {
    steps: { type: 'int', min: 1, max: 16, default: 8, label: 'n' },
    pulses: { type: 'int', min: 0, max: 16, default: 3, label: 'k' },
    offset: { type: 'int', min: 0, max: 15, default: 0, label: 'rot' },
  },

  initialize(): EuclideanState {
    return {
      pattern: null,
      currentStep: 0,
      clockWasHigh: false,
      outTimer: 0,
      accentTimer: 0,
      indicatorTimer: 0,
      _prevN: null,
      _prevK: null,
      _prevRot: null,
    }
  },

  process(inputs, outputs, params, state, context) {
    function buildPattern(n: number, k: number, rot: number): number[] {
      const pat: number[] = []
      for (let i = 0; i < n; i++) {
        pat.push(
          Math.floor(((i + 1) * k) / n) > Math.floor((i * k) / n) ? 1 : 0,
        )
      }
      const rotated: number[] = []
      for (let i = 0; i < n; i++) {
        rotated.push(pat[(i - rot + n) % n] ?? 0)
      }
      return rotated
    }

    const n = Math.max(1, Math.round(params.steps))
    const k = Math.max(0, Math.min(n, Math.round(params.pulses)))
    const rot = Math.round(params.offset) % n
    const triggerDuration = Math.round(context.sampleRate * 0.004) // 4ms pulse
    const indicatorDuration = Math.max(1, Math.round(context.sampleRate * 0.03))

    if (state._prevN !== n || state._prevK !== k || state._prevRot !== rot) {
      state.pattern = buildPattern(n, k, rot)
      state._prevN = n
      state._prevK = k
      state._prevRot = rot
    }

    const pattern = state.pattern as number[]
    for (let i = 0; i < 128; i++) {
      const clockHigh = (inputs.clock[i] ?? 0) > 0.5
      const resetHigh = (inputs.reset[i] ?? 0) > 0.5
      const risingEdge = clockHigh && !(state.clockWasHigh as boolean)

      if (resetHigh) {
        state.currentStep = 0
      }

      if (risingEdge) {
        state.currentStep = ((state.currentStep as number) + 1) % n
        const active = pattern[state.currentStep as number] === 1
        if (active) {
          state.outTimer = triggerDuration
          if ((state.currentStep as number) === 0) {
            state.accentTimer = triggerDuration
          }
        }
      }

      // 4ms trigger pulses
      if (state.outTimer > 0) {
        outputs.out[i] = 1
        state.outTimer--
        state.indicatorTimer = indicatorDuration
      } else {
        outputs.out[i] = 0
        if ((state.indicatorTimer as number) > 0) {
          state.indicatorTimer = (state.indicatorTimer as number) - 1
        }
      }
      if (state.accentTimer > 0) {
        outputs.accent[i] = 1
        state.accentTimer--
      } else {
        outputs.accent[i] = 0
      }

      state.clockWasHigh = clockHigh
    }

    // write indicator state for UI lights
    const indBuf = state._indicatorBuffer as Int32Array | undefined
    if (indBuf) {
      Atomics.store(indBuf, 0, (state.indicatorTimer as number) > 0 ? 1 : 0)
      Atomics.store(indBuf, 1, 0)
    }
  },
}
