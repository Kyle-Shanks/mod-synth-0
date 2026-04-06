import type { ModuleDefinition } from '../../engine/types'

interface FlangerState {
  buffer: null | Float32Array
  writeIdx: number
  lfoPhase: number
  fbSample: number
  initialized: boolean
  [key: string]: unknown
}

export const FlangerDefinition: ModuleDefinition<
  {
    in: { type: 'audio'; default: 0; label: 'in' }
  },
  {
    out: { type: 'audio'; default: 0; label: 'out' }
  },
  {
    mode: {
      type: 'select'
      default: 0
      options: ['flanger', 'chorus']
      label: 'mode'
    }
    rate: {
      type: 'float'
      min: 0.01
      max: 10
      default: 0.5
      label: 'rate'
      unit: 'hz'
    }
    depth: { type: 'float'; min: 0; max: 1; default: 0.5; label: 'depth' }
    feedback: { type: 'float'; min: 0; max: 0.95; default: 0.5; label: 'fdbk' }
    mix: { type: 'float'; min: 0; max: 1; default: 0.5; label: 'mix' }
  },
  FlangerState
> = {
  id: 'flanger',
  name: 'flanger',
  category: 'fx',
  width: 3,
  height: 4,

  inputs: {
    in: { type: 'audio', default: 0, label: 'in' },
  },
  outputs: {
    out: { type: 'audio', default: 0, label: 'out' },
  },
  params: {
    mode: {
      type: 'select',
      default: 0,
      options: ['flanger', 'chorus'],
      label: 'mode',
    },
    mix: { type: 'float', min: 0, max: 1, default: 0.5, label: 'mix' },
    rate: {
      type: 'float',
      min: 0.01,
      max: 10,
      default: 0.5,
      label: 'rate',
      unit: 'hz',
    },
    depth: { type: 'float', min: 0, max: 1, default: 0.5, label: 'depth' },
    feedback: { type: 'float', min: 0, max: 0.95, default: 0.5, label: 'fdbk' },
  },

  initialize(): FlangerState {
    return {
      buffer: null,
      writeIdx: 0,
      lfoPhase: 0,
      fbSample: 0,
      initialized: false,
    }
  },

  process(inputs, outputs, params, state, context) {
    if (!state.initialized) {
      state.buffer = new Float32Array(
        Math.round(context.sampleRate * 0.05) + 128,
      )
      state.initialized = true
    }

    const buf = state.buffer as Float32Array
    const bufLen = buf.length
    const mode = Math.round(params.mode)
    const twoPi = 2 * Math.PI

    // flanger: base 3ms ± 6ms; chorus: base 20ms ± 15ms
    const baseDelay =
      mode === 0 ? context.sampleRate * 0.003 : context.sampleRate * 0.02
    const modRange =
      mode === 0 ? context.sampleRate * 0.006 : context.sampleRate * 0.015
    // keep delay strictly positive to avoid reading ahead of the write head
    // (negative/near-zero delay causes zippery clicks at high depth)
    const minDelaySamples = 2
    const depth = Math.max(0, Math.min(1, params.depth))
    const maxModDepth = Math.max(0, baseDelay - minDelaySamples)
    const modDepth = Math.min(modRange * depth, maxModDepth)

    const lfoInc = params.rate / context.sampleRate

    for (let i = 0; i < 128; i++) {
      // advance lfo
      state.lfoPhase = ((state.lfoPhase as number) + lfoInc) % 1
      const lfo = Math.sin((state.lfoPhase as number) * twoPi)
      const delaySamples = baseDelay + lfo * modDepth

      // linear interpolation read
      const readPos =
        ((state.writeIdx as number) - delaySamples + bufLen) % bufLen
      const readFloor = Math.floor(readPos)
      const readFrac = readPos - readFloor
      const s0 = buf[readFloor % bufLen] ?? 0
      const s1 = buf[(readFloor + 1) % bufLen] ?? 0
      const delayed = s0 + (s1 - s0) * readFrac

      const dry = inputs.in[i] ?? 0
      buf[state.writeIdx as number] =
        dry + (state.fbSample as number) * params.feedback
      state.writeIdx = ((state.writeIdx as number) + 1) % bufLen
      state.fbSample = delayed

      outputs.out[i] = dry * (1 - params.mix) + delayed * params.mix
    }
  },
}
