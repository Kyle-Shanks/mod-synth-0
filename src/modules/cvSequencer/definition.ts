import type {
  ModuleDefinition,
  ParamDefinition,
  PortDefinition,
} from '../../engine/types'

const PATTERN_COUNT = 4
const STEPS_PER_PATTERN = 16
const TOTAL_STEPS = PATTERN_COUNT * STEPS_PER_PATTERN

interface CVSequencerState {
  stepA: number
  stepB: number
  stepC: number
  stepD: number
  clockWasHigh: boolean
  resetWasHigh: boolean
  patternWasHigh: boolean
  activePattern: number
  playPatternParam: number
  valueParamKeys: string[]
  valueCache: Float32Array
  indicatorStep: number
  [key: string]: unknown
}

const cvSequencerInputs: Record<string, PortDefinition> = {
  clock: { type: 'gate', default: 0, label: 'clock' },
  reset: { type: 'trigger', default: 0, label: 'reset' },
  pattern: { type: 'trigger', default: 0, label: 'pattern' },
}

const cvSequencerOutputs: Record<string, PortDefinition> = {
  cv: { type: 'cv', default: 0, label: 'out' },
  gate: { type: 'gate', default: 0, label: 'gate' },
}

const cvSequencerParams: Record<string, ParamDefinition> = {
  length: {
    type: 'int',
    min: 1,
    max: 16,
    default: 16,
    label: 'length',
  },
  playPattern: {
    type: 'int',
    min: 0,
    max: 3,
    default: 0,
    label: 'play',
  },
  patternSpan: {
    type: 'int',
    min: 1,
    max: 4,
    default: 4,
    label: 'span',
  },
}

for (let pattern = 1; pattern <= PATTERN_COUNT; pattern++) {
  for (let step = 1; step <= STEPS_PER_PATTERN; step++) {
    cvSequencerParams[`p${pattern}s${step}`] = {
      type: 'float',
      min: -2,
      max: 2,
      default: 0,
      label: `${pattern}:${step}`,
    }
  }
}

export const CVSequencerDefinition: ModuleDefinition<
  Record<string, PortDefinition>,
  Record<string, PortDefinition>,
  Record<string, ParamDefinition>,
  CVSequencerState
> = {
  id: 'cvsequencer',
  name: 'cv seq',
  category: 'control',
  width: 12,
  height: 5,

  inputs: cvSequencerInputs,
  outputs: cvSequencerOutputs,
  params: cvSequencerParams,

  initialize(): CVSequencerState {
    const valueParamKeys: string[] = []
    for (let pattern = 1; pattern <= PATTERN_COUNT; pattern++) {
      for (let step = 1; step <= STEPS_PER_PATTERN; step++) {
        valueParamKeys.push(`p${pattern}s${step}`)
      }
    }

    return {
      stepA: STEPS_PER_PATTERN - 1,
      stepB: STEPS_PER_PATTERN - 1,
      stepC: STEPS_PER_PATTERN - 1,
      stepD: STEPS_PER_PATTERN - 1,
      clockWasHigh: false,
      resetWasHigh: false,
      patternWasHigh: false,
      activePattern: 0,
      playPatternParam: 0,
      valueParamKeys,
      valueCache: new Float32Array(TOTAL_STEPS),
      indicatorStep: 0,
    }
  },

  process(inputs, outputs, params, state) {
    const patternCount = 4
    const stepsPerPattern = 16
    const totalSteps = patternCount * stepsPerPattern

    const clockInput = inputs.clock as Float32Array
    const resetInput = inputs.reset as Float32Array
    const patternInput = inputs.pattern as Float32Array
    const cvOutput = outputs.cv as Float32Array
    const gateOutput = outputs.gate as Float32Array

    const numSteps = Math.max(1, Math.min(16, Math.round(params.length ?? 16)))

    let manualPattern = Math.round(params.playPattern ?? 0)
    if (manualPattern < 0) manualPattern = 0
    if (manualPattern > 3) manualPattern = 3
    const patternSpan = Math.max(
      1,
      Math.min(patternCount, Math.round(params.patternSpan ?? patternCount)),
    )

    let valueParamKeys = state.valueParamKeys as string[] | undefined
    let valueCache = state.valueCache as Float32Array | undefined

    if (!valueParamKeys || valueParamKeys.length !== totalSteps) {
      valueParamKeys = []
      for (let pattern = 1; pattern <= patternCount; pattern++) {
        for (let step = 1; step <= stepsPerPattern; step++) {
          valueParamKeys.push(`p${pattern}s${step}`)
        }
      }
      state.valueParamKeys = valueParamKeys
    }

    if (!valueCache || valueCache.length !== totalSteps) {
      valueCache = new Float32Array(totalSteps)
      state.valueCache = valueCache
    }

    for (let i = 0; i < totalSteps; i++) {
      const value = params[valueParamKeys[i]!] ?? 0
      valueCache[i] = Math.max(-2, Math.min(2, value))
    }

    let stepA = Math.round(state.stepA ?? 0)
    let stepB = Math.round(state.stepB ?? 0)
    let stepC = Math.round(state.stepC ?? 0)
    let stepD = Math.round(state.stepD ?? 0)

    if (stepA < 0 || stepA >= numSteps) {
      stepA = ((stepA % numSteps) + numSteps) % numSteps
    }
    if (stepB < 0 || stepB >= numSteps) {
      stepB = ((stepB % numSteps) + numSteps) % numSteps
    }
    if (stepC < 0 || stepC >= numSteps) {
      stepC = ((stepC % numSteps) + numSteps) % numSteps
    }
    if (stepD < 0 || stepD >= numSteps) {
      stepD = ((stepD % numSteps) + numSteps) % numSteps
    }

    let clockWasHigh = !!state.clockWasHigh
    let resetWasHigh = !!state.resetWasHigh
    let patternWasHigh = !!state.patternWasHigh
    const previousPlayPatternParam = Math.round(state.playPatternParam ?? 0)
    let activePattern = Math.round(state.activePattern ?? manualPattern)
    if (activePattern < 0) activePattern = 0
    if (activePattern > 3) activePattern = 3

    if (manualPattern !== previousPlayPatternParam) {
      activePattern = manualPattern
    }
    if (activePattern >= patternSpan) {
      activePattern = activePattern % patternSpan
    }

    let activeStep = Math.round(state.indicatorStep ?? 0)

    for (let i = 0; i < 128; i++) {
      const resetHigh = (resetInput[i] ?? 0) > 0.5
      const clockHigh = (clockInput[i] ?? 0) > 0.5
      const patternHigh = (patternInput[i] ?? 0) > 0.5
      const clockRising = clockHigh && !clockWasHigh

      if (resetHigh) {
        stepA = 0
        stepB = 0
        stepC = 0
        stepD = 0
        activePattern = 0

        // While reset is held high, suppress sequence/pattern advances and keep
        // high-state trackers aligned so release does not create false edges.
        clockWasHigh = clockHigh
        patternWasHigh = patternHigh
        resetWasHigh = true

        cvOutput[i] = valueCache[0] ?? 0
        gateOutput[i] = 0
        activeStep = 0
        continue
      }
      resetWasHigh = false

      if (clockRising) {
        stepA = (stepA + 1) % numSteps
        stepB = (stepB + 1) % numSteps
        stepC = (stepC + 1) % numSteps
        stepD = (stepD + 1) % numSteps
      }
      clockWasHigh = clockHigh

      if (patternHigh && !patternWasHigh) {
        activePattern = (activePattern + 1) % patternSpan
      }
      patternWasHigh = patternHigh
      const selectedPattern = activePattern

      let selectedStep = stepA
      if (selectedPattern === 1) selectedStep = stepB
      else if (selectedPattern === 2) selectedStep = stepC
      else if (selectedPattern === 3) selectedStep = stepD

      const cacheIndex = selectedPattern * stepsPerPattern + selectedStep
      const cvValue = valueCache[cacheIndex] ?? 0

      cvOutput[i] = cvValue
      gateOutput[i] = clockHigh ? 1 : 0

      activePattern = selectedPattern
      if (clockRising) {
        activeStep = selectedStep
      }
    }

    state.stepA = stepA
    state.stepB = stepB
    state.stepC = stepC
    state.stepD = stepD
    state.clockWasHigh = clockWasHigh
    state.resetWasHigh = resetWasHigh
    state.patternWasHigh = patternWasHigh
    state.playPatternParam = manualPattern
    state.activePattern = activePattern
    state.indicatorStep = activeStep

    const indBuf = state._indicatorBuffer as Int32Array | undefined
    if (indBuf) {
      Atomics.store(indBuf, 0, activePattern)
      Atomics.store(indBuf, 1, activeStep)
    }
  },
}
