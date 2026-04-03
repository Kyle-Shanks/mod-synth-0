import type { ModuleDefinition } from '../../engine/types'

interface DelayState {
  buffer: Float32Array | null
  writeIdx: number
  initialized: boolean
  [key: string]: unknown
}

export const DelayDefinition: ModuleDefinition<
  {
    audio: { type: 'audio'; default: 0; label: 'in' }
    timeCv: { type: 'cv'; default: 0; label: 'time cv' }
  },
  {
    out: { type: 'audio'; default: 0; label: 'out' }
  },
  {
    time: {
      type: 'float'
      min: 0.001
      max: 2
      default: 0.3
      label: 'time'
      unit: 's'
    }
  },
  DelayState
> = {
  id: 'delay',
  name: 'delay',
  category: 'utility',
  width: 3,
  height: 3,

  inputs: {
    audio: { type: 'audio', default: 0, label: 'in' },
    timeCv: { type: 'cv', default: 0, label: 'time cv' },
  },
  outputs: {
    out: { type: 'audio', default: 0, label: 'out' },
  },
  params: {
    time: {
      type: 'float',
      min: 0.001,
      max: 2,
      default: 0.3,
      label: 'time',
      unit: 's',
    },
  },

  initialize(): DelayState {
    return {
      buffer: null,
      writeIdx: 0,
      initialized: false,
    }
  },

  process(inputs, outputs, params, state, context) {
    const sampleRate = context.sampleRate
    // max delay: 2 seconds
    const maxDelaySamples = Math.round(sampleRate * 2)

    // lazy-init delay buffer
    if (!state.initialized) {
      state.buffer = new Float32Array(maxDelaySamples)
      state.writeIdx = 0
      state.initialized = true
    }

    const buf = state.buffer as Float32Array
    const bufLen = buf.length

    for (let i = 0; i < 128; i++) {
      const input = inputs.audio[i] ?? 0

      // modulate delay time with CV (±50% of base time)
      const timeCv = inputs.timeCv[i] ?? 0
      const delayTime = Math.max(
        0.001,
        Math.min(2, params.time * (1 + timeCv * 0.5)),
      )
      const delaySamples = Math.min(
        bufLen - 1,
        Math.round(delayTime * sampleRate),
      )

      // read delayed signal
      const readPos = (state.writeIdx as number) - delaySamples
      const readIdx = ((readPos % bufLen) + bufLen) % bufLen
      const delayed = buf[readIdx]!

      // write input into delay line (pure delay, no feedback)
      buf[state.writeIdx as number] = input
      state.writeIdx = ((state.writeIdx as number) + 1) % bufLen

      outputs.out[i] = delayed
    }
  },
}
