import type { ModuleDefinition } from '../../engine/types'

interface ScopeState {
  writeIndex: number
  scopeBuffer: Float32Array | null
  writeIndexBuffer: Int32Array | null
  [key: string]: unknown
}

export const ScopeDefinition: ModuleDefinition<
  { in: { type: 'audio'; default: 0; label: 'in' } },
  Record<string, never>,
  { timeScale: { type: 'float'; min: 1; max: 10; default: 1; label: 'time' } },
  ScopeState
> = {
  id: 'scope',
  name: 'scope',
  category: 'display',
  width: 4,
  height: 5,

  inputs: {
    in: { type: 'audio', default: 0, label: 'in' },
  },
  outputs: {},
  params: {
    timeScale: { type: 'float', min: 1, max: 10, default: 1, label: 'time' },
  },

  initialize(): ScopeState {
    return {
      writeIndex: 0,
      scopeBuffer: null,
      writeIndexBuffer: null,
    }
  },

  process(inputs, _outputs, _params, state) {
    // If no shared buffer has been injected, just skip
    const scopeBuffer = state.scopeBuffer as Float32Array | null
    const writeIndexBuffer = state.writeIndexBuffer as Int32Array | null
    if (!scopeBuffer || !writeIndexBuffer) return

    const bufferLength = scopeBuffer.length
    let writeIndex = state.writeIndex as number

    for (let i = 0; i < 128; i++) {
      scopeBuffer[writeIndex % bufferLength] = inputs.in[i] ?? 0
      writeIndex++
    }

    // wrap around
    state.writeIndex = writeIndex % bufferLength
    // store write index atomically so main thread can read it
    Atomics.store(writeIndexBuffer, 0, state.writeIndex as number)
  },
}
