import type { ModuleDefinition } from '../../engine/types'

interface ComparatorState {
  [key: string]: unknown
}

export const ComparatorDefinition: ModuleDefinition<
  {
    a: { type: 'cv'; default: 0; label: 'a' }
    b: { type: 'cv'; default: 0; label: 'b' }
  },
  {
    gt: { type: 'gate'; default: 0; label: 'gt' }
    lt: { type: 'gate'; default: 0; label: 'lt' }
    eq: { type: 'gate'; default: 0; label: 'eq' }
  },
  {
    threshold: {
      type: 'float'
      min: 0.001
      max: 1
      default: 0.01
      label: 'thr'
    }
  },
  ComparatorState
> = {
  id: 'comparator',
  name: 'comparator',
  category: 'utility',
  width: 3,
  height: 3,

  inputs: {
    a: { type: 'cv', default: 0, label: 'a' },
    b: { type: 'cv', default: 0, label: 'b' },
  },
  outputs: {
    gt: { type: 'gate', default: 0, label: 'gt' },
    lt: { type: 'gate', default: 0, label: 'lt' },
    eq: { type: 'gate', default: 0, label: 'eq' },
  },
  params: {
    threshold: {
      type: 'float',
      min: 0.001,
      max: 1,
      default: 0.01,
      label: 'thr',
    },
  },

  initialize(): ComparatorState {
    return {}
  },

  process(inputs, outputs, params) {
    const thr = params.threshold
    for (let i = 0; i < 128; i++) {
      const diff = (inputs.a[i] ?? 0) - (inputs.b[i] ?? 0)
      outputs.gt[i] = diff > thr ? 1 : 0
      outputs.lt[i] = diff < -thr ? 1 : 0
      outputs.eq[i] = Math.abs(diff) <= thr ? 1 : 0
    }
  },
}
