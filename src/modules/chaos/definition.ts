import type { ModuleDefinition } from '../../engine/types'

interface ChaosState {
  x: number
  y: number
  z: number
  [key: string]: unknown
}

export const ChaosDefinition: ModuleDefinition<
  Record<string, never>,
  {
    x: { type: 'cv'; default: 0; label: 'x' }
    y: { type: 'cv'; default: 0; label: 'y' }
    z: { type: 'cv'; default: 0; label: 'z' }
  },
  {
    speed: { type: 'float'; min: 0.01; max: 10; default: 1; label: 'speed' }
    sigma: { type: 'float'; min: 1; max: 20; default: 10; label: 'sigma' }
    rho: { type: 'float'; min: 1; max: 50; default: 28; label: 'rho' }
    beta: { type: 'float'; min: 0.1; max: 5; default: 2.667; label: 'beta' }
    scale: { type: 'float'; min: 0.01; max: 1; default: 0.05; label: 'scale' }
  },
  ChaosState
> = {
  id: 'chaos',
  name: 'chaos',
  category: 'source',
  width: 5,
  height: 3,

  inputs: {},
  outputs: {
    x: { type: 'cv', default: 0, label: 'x' },
    y: { type: 'cv', default: 0, label: 'y' },
    z: { type: 'cv', default: 0, label: 'z' },
  },
  params: {
    speed: { type: 'float', min: 0.01, max: 10, default: 1, label: 'speed' },
    sigma: { type: 'float', min: 1, max: 20, default: 10, label: 'sigma' },
    rho: { type: 'float', min: 1, max: 50, default: 28, label: 'rho' },
    beta: { type: 'float', min: 0.1, max: 5, default: 2.667, label: 'beta' },
    scale: { type: 'float', min: 0.01, max: 1, default: 0.05, label: 'scale' },
  },

  initialize(): ChaosState {
    return { x: 0.1, y: 0, z: 0 }
  },

  process(_inputs, outputs, params, state, context) {
    const dt = (1 / context.sampleRate) * params.speed
    const sigma = params.sigma
    const rho = params.rho
    const beta = params.beta
    const scale = params.scale

    for (let i = 0; i < 128; i++) {
      const dx = sigma * (state.y - state.x) * dt
      const dy = (state.x * (rho - state.z) - state.y) * dt
      const dz = (state.x * state.y - beta * state.z) * dt

      state.x += dx
      state.y += dy
      state.z += dz

      outputs.x[i] = Math.max(-2, Math.min(2, state.x * scale))
      outputs.y[i] = Math.max(-2, Math.min(2, state.y * scale))
      outputs.z[i] = Math.max(-2, Math.min(2, state.z * scale))
    }
  },
}
