import type { ModuleDefinition } from '../../engine/types'

interface XYScopeState {
  xBuffer: Float32Array | null
  yBuffer: Float32Array | null
  writeIndexBuffer: Int32Array | null
  xyWriteIndex: number
  [key: string]: unknown
}

export const XYScopeDefinition: ModuleDefinition<
  {
    x: { type: 'audio'; default: 0; label: 'x' }
    y: { type: 'audio'; default: 0; label: 'y' }
  },
  Record<string, never>,
  {
    scale:   { type: 'float'; min: 0.1; max: 4; default: 1;   label: 'scale' }
    persist: { type: 'float'; min: 0;   max: 1; default: 0.3; label: 'fade'  }
  },
  XYScopeState
> = {
  id: 'xyscope',
  name: 'xy scope',
  category: 'display',
  width: 4,
  height: 5,

  inputs: {
    x: { type: 'audio', default: 0, label: 'x' },
    y: { type: 'audio', default: 0, label: 'y' },
  },
  outputs: {},
  params: {
    scale:   { type: 'float', min: 0.1, max: 4, default: 1,   label: 'scale' },
    persist: { type: 'float', min: 0,   max: 1, default: 0.3, label: 'fade'  },
  },

  initialize(): XYScopeState {
    return {
      xBuffer: null,
      yBuffer: null,
      writeIndexBuffer: null,
      xyWriteIndex: 0,
    }
  },

  process(inputs, _outputs, _params, state) {
    const xBuffer        = state.xBuffer as Float32Array | null
    const yBuffer        = state.yBuffer as Float32Array | null
    const writeIndexBuffer = state.writeIndexBuffer as Int32Array | null
    if (!xBuffer || !yBuffer || !writeIndexBuffer) return

    let xyWriteIndex = state.xyWriteIndex as number
    const bufLen = xBuffer.length

    for (let i = 0; i < 128; i++) {
      xBuffer[xyWriteIndex % bufLen] = inputs.x[i] ?? 0
      yBuffer[xyWriteIndex % bufLen] = inputs.y[i] ?? 0
      xyWriteIndex++
    }

    state.xyWriteIndex = xyWriteIndex % bufLen
    Atomics.store(writeIndexBuffer, 0, state.xyWriteIndex as number)
  },
}
