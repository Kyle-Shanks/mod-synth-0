import type { ModuleDefinition } from '../../engine/types'

interface MixerState {
  _meters: Record<string, number>
  [key: string]: unknown
}

export const MixerDefinition: ModuleDefinition<
  {
    in1: { type: 'audio'; default: 0; label: 'in 1' }
    in2: { type: 'audio'; default: 0; label: 'in 2' }
    in3: { type: 'audio'; default: 0; label: 'in 3' }
    in4: { type: 'audio'; default: 0; label: 'in 4' }
  },
  { out: { type: 'audio'; default: 0; label: 'out' } },
  {
    level1: { type: 'float'; min: 0; max: 1; default: 0.8; label: 'lv 1' }
    level2: { type: 'float'; min: 0; max: 1; default: 0.8; label: 'lv 2' }
    level3: { type: 'float'; min: 0; max: 1; default: 0.8; label: 'lv 3' }
    level4: { type: 'float'; min: 0; max: 1; default: 0.8; label: 'lv 4' }
    master: { type: 'float'; min: 0; max: 1; default: 1; label: 'mstr' }
  },
  MixerState
> = {
  id: 'mixer',
  name: 'mixer',
  category: 'utility',
  width: 5,
  height: 4,

  inputs: {
    in1: { type: 'audio', default: 0, label: 'in 1' },
    in2: { type: 'audio', default: 0, label: 'in 2' },
    in3: { type: 'audio', default: 0, label: 'in 3' },
    in4: { type: 'audio', default: 0, label: 'in 4' },
  },
  outputs: {
    out: { type: 'audio', default: 0, label: 'out' },
  },
  params: {
    level1: { type: 'float', min: 0, max: 1, default: 0.8, label: 'lv 1' },
    level2: { type: 'float', min: 0, max: 1, default: 0.8, label: 'lv 2' },
    level3: { type: 'float', min: 0, max: 1, default: 0.8, label: 'lv 3' },
    level4: { type: 'float', min: 0, max: 1, default: 0.8, label: 'lv 4' },
    master: { type: 'float', min: 0, max: 1, default: 1, label: 'mstr' },
  },

  initialize(): MixerState {
    return {
      _meters: {
        ch1L: 0,
        ch1R: 0,
        ch2L: 0,
        ch2R: 0,
        ch3L: 0,
        ch3R: 0,
        ch4L: 0,
        ch4R: 0,
        masterL: 0,
        masterR: 0,
      },
    }
  },

  process(inputs, outputs, params, state) {
    let peak1 = 0
    let peak2 = 0
    let peak3 = 0
    let peak4 = 0
    let peakMaster = 0

    for (let i = 0; i < 128; i++) {
      const ch1 = (inputs.in1[i] ?? 0) * params.level1
      const ch2 = (inputs.in2[i] ?? 0) * params.level2
      const ch3 = (inputs.in3[i] ?? 0) * params.level3
      const ch4 = (inputs.in4[i] ?? 0) * params.level4

      const abs1 = Math.abs(ch1)
      const abs2 = Math.abs(ch2)
      const abs3 = Math.abs(ch3)
      const abs4 = Math.abs(ch4)
      if (abs1 > peak1) peak1 = abs1
      if (abs2 > peak2) peak2 = abs2
      if (abs3 > peak3) peak3 = abs3
      if (abs4 > peak4) peak4 = abs4

      const out = (ch1 + ch2 + ch3 + ch4) * params.master
      outputs.out[i] = out

      const absOut = Math.abs(out)
      if (absOut > peakMaster) peakMaster = absOut
    }

    const meters = state._meters as Record<string, number>
    meters.ch1L = Math.min(1, peak1)
    meters.ch1R = Math.min(1, peak1)
    meters.ch2L = Math.min(1, peak2)
    meters.ch2R = Math.min(1, peak2)
    meters.ch3L = Math.min(1, peak3)
    meters.ch3R = Math.min(1, peak3)
    meters.ch4L = Math.min(1, peak4)
    meters.ch4R = Math.min(1, peak4)
    meters.masterL = Math.min(1, peakMaster)
    meters.masterR = Math.min(1, peakMaster)
  },
}
