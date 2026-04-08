import type { ModuleDefinition } from '../../engine/types'

interface SpectrumState {
  writeIndex: number
  scopeBuffer: Float32Array | null
  writeIndexBuffer: Int32Array | null
  [key: string]: unknown
}

export const SpectrumDefinition: ModuleDefinition<
  { in: { type: 'audio'; default: 0; label: 'in' } },
  Record<string, never>,
  Record<string, never>,
  SpectrumState
> = {
  id: 'spectrum',
  name: 'freq spectrum',
  category: 'display',
  width: 6,
  height: 4,

  inputs: {
    in: { type: 'audio', default: 0, label: 'in' },
  },
  outputs: {},
  params: {},

  initialize(): SpectrumState {
    return {
      writeIndex: 0,
      scopeBuffer: null,
      writeIndexBuffer: null,
    }
  },

  process(inputs, _outputs, _params, state) {
    const scopeBuffer = state.scopeBuffer as Float32Array | null
    const writeIndexBuffer = state.writeIndexBuffer as Int32Array | null
    if (!scopeBuffer || !writeIndexBuffer) return

    const bufferLength = scopeBuffer.length
    let writeIndex = state.writeIndex as number

    for (let i = 0; i < 128; i++) {
      scopeBuffer[writeIndex % bufferLength] = inputs.in[i] ?? 0
      writeIndex++
    }

    state.writeIndex = writeIndex % bufferLength
    Atomics.store(writeIndexBuffer, 0, state.writeIndex as number)
  },
}
