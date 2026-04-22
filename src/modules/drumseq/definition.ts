import type {
  ModuleDefinition,
  ParamDefinition,
  PortDefinition,
} from '../../engine/types'

const PATTERN_COUNT = 4
const TRACK_COUNT = 4
const STEPS_PER_PATTERN = 16
const TOTAL_STEP_CELLS = PATTERN_COUNT * TRACK_COUNT * STEPS_PER_PATTERN

interface DrumSequencerState {
  stepA: number
  stepB: number
  stepC: number
  stepD: number
  clockWasHigh: boolean
  resetWasHigh: boolean
  patternWasHigh: boolean
  activePattern: number
  playPatternParam: number
  stepParamKeys: string[]
  stepCache: Uint8Array
  triggerTimers: Int32Array
  indicatorStep: number
  [key: string]: unknown
}

const drumSequencerInputs: Record<string, PortDefinition> = {
  clock: { type: 'gate', default: 0, label: 'clock' },
  reset: { type: 'trigger', default: 0, label: 'reset' },
  pattern: { type: 'trigger', default: 0, label: 'pattern' },
}

const drumSequencerOutputs: Record<string, PortDefinition> = {
  track1: { type: 'trigger', default: 0, label: 'trig1' },
  track2: { type: 'trigger', default: 0, label: 'trig2' },
  track3: { type: 'trigger', default: 0, label: 'trig3' },
  track4: { type: 'trigger', default: 0, label: 'trig4' },
}

const drumSequencerParams: Record<string, ParamDefinition> = {
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
  for (let track = 1; track <= TRACK_COUNT; track++) {
    for (let step = 1; step <= STEPS_PER_PATTERN; step++) {
      drumSequencerParams[`p${pattern}t${track}s${step}`] = {
        type: 'boolean',
        default: 0,
        label: `${pattern}:${track}:${step}`,
      }
    }
  }
}

export const DrumSequencerDefinition: ModuleDefinition<
  Record<string, PortDefinition>,
  Record<string, PortDefinition>,
  Record<string, ParamDefinition>,
  DrumSequencerState
> = {
  id: 'drumsequencer',
  name: 'drum seq',
  category: 'control',
  width: 12,
  height: 5,

  inputs: drumSequencerInputs,
  outputs: drumSequencerOutputs,
  params: drumSequencerParams,

  initialize(): DrumSequencerState {
    const stepParamKeys: string[] = []

    for (let pattern = 1; pattern <= PATTERN_COUNT; pattern++) {
      for (let track = 1; track <= TRACK_COUNT; track++) {
        for (let step = 1; step <= STEPS_PER_PATTERN; step++) {
          stepParamKeys.push(`p${pattern}t${track}s${step}`)
        }
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
      stepParamKeys,
      stepCache: new Uint8Array(TOTAL_STEP_CELLS),
      triggerTimers: new Int32Array(TRACK_COUNT),
      indicatorStep: 0,
    }
  },

  process(inputs, outputs, params, state, context) {
    const patternCount = 4
    const trackCount = 4
    const stepsPerPattern = 16
    const totalStepCells = patternCount * trackCount * stepsPerPattern
    const triggerDuration = Math.max(1, Math.round(context.sampleRate * 0.004))

    const clockInput = inputs.clock as Float32Array
    const resetInput = inputs.reset as Float32Array
    const patternInput = inputs.pattern as Float32Array
    const out1 = outputs.track1 as Float32Array
    const out2 = outputs.track2 as Float32Array
    const out3 = outputs.track3 as Float32Array
    const out4 = outputs.track4 as Float32Array

    const numSteps = Math.max(1, Math.min(16, Math.round(params.length ?? 16)))

    let manualPattern = Math.round(params.playPattern ?? 0)
    if (manualPattern < 0) manualPattern = 0
    if (manualPattern > 3) manualPattern = 3
    const patternSpan = Math.max(
      1,
      Math.min(patternCount, Math.round(params.patternSpan ?? patternCount)),
    )

    let stepParamKeys = state.stepParamKeys as string[] | undefined
    let stepCache = state.stepCache as Uint8Array | undefined
    let triggerTimers = state.triggerTimers as Int32Array | undefined

    if (!stepParamKeys || stepParamKeys.length !== totalStepCells) {
      stepParamKeys = []
      for (let pattern = 1; pattern <= patternCount; pattern++) {
        for (let track = 1; track <= trackCount; track++) {
          for (let step = 1; step <= stepsPerPattern; step++) {
            stepParamKeys.push(`p${pattern}t${track}s${step}`)
          }
        }
      }
      state.stepParamKeys = stepParamKeys
    }

    if (!stepCache || stepCache.length !== totalStepCells) {
      stepCache = new Uint8Array(totalStepCells)
      state.stepCache = stepCache
    }

    if (!triggerTimers || triggerTimers.length !== trackCount) {
      triggerTimers = new Int32Array(trackCount)
      state.triggerTimers = triggerTimers
    }

    for (let i = 0; i < totalStepCells; i++) {
      const value = params[stepParamKeys[i]!] ?? 0
      stepCache[i] = value >= 0.5 ? 1 : 0
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
      const resetRising = resetHigh && !resetWasHigh

      if (resetHigh) {
        stepA = 0
        stepB = 0
        stepC = 0
        stepD = 0
        activePattern = 0

        if (resetRising) {
          triggerTimers[0] = 0
          triggerTimers[1] = 0
          triggerTimers[2] = 0
          triggerTimers[3] = 0

          const base = 0
          const track1On = stepCache[base] ?? 0
          const track2On = stepCache[base + stepsPerPattern] ?? 0
          const track3On = stepCache[base + stepsPerPattern * 2] ?? 0
          const track4On = stepCache[base + stepsPerPattern * 3] ?? 0

          if (track1On > 0) triggerTimers[0] = triggerDuration
          if (track2On > 0) triggerTimers[1] = triggerDuration
          if (track3On > 0) triggerTimers[2] = triggerDuration
          if (track4On > 0) triggerTimers[3] = triggerDuration
        }

        clockWasHigh = clockHigh
        patternWasHigh = patternHigh
        resetWasHigh = true
        activeStep = 0

        const timer1 = triggerTimers[0] ?? 0
        if (timer1 > 0) {
          out1[i] = 1
          triggerTimers[0] = timer1 - 1
        } else {
          out1[i] = 0
        }
        const timer2 = triggerTimers[1] ?? 0
        if (timer2 > 0) {
          out2[i] = 1
          triggerTimers[1] = timer2 - 1
        } else {
          out2[i] = 0
        }
        const timer3 = triggerTimers[2] ?? 0
        if (timer3 > 0) {
          out3[i] = 1
          triggerTimers[2] = timer3 - 1
        } else {
          out3[i] = 0
        }
        const timer4 = triggerTimers[3] ?? 0
        if (timer4 > 0) {
          out4[i] = 1
          triggerTimers[3] = timer4 - 1
        } else {
          out4[i] = 0
        }
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

      if (clockRising) {
        const base =
          selectedPattern * trackCount * stepsPerPattern + selectedStep
        const track1On = stepCache[base] ?? 0
        const track2On = stepCache[base + stepsPerPattern] ?? 0
        const track3On = stepCache[base + stepsPerPattern * 2] ?? 0
        const track4On = stepCache[base + stepsPerPattern * 3] ?? 0

        if (track1On > 0) triggerTimers[0] = triggerDuration
        if (track2On > 0) triggerTimers[1] = triggerDuration
        if (track3On > 0) triggerTimers[2] = triggerDuration
        if (track4On > 0) triggerTimers[3] = triggerDuration
      }

      const timer1 = triggerTimers[0] ?? 0
      if (timer1 > 0) {
        out1[i] = 1
        triggerTimers[0] = timer1 - 1
      } else {
        out1[i] = 0
      }
      const timer2 = triggerTimers[1] ?? 0
      if (timer2 > 0) {
        out2[i] = 1
        triggerTimers[1] = timer2 - 1
      } else {
        out2[i] = 0
      }
      const timer3 = triggerTimers[2] ?? 0
      if (timer3 > 0) {
        out3[i] = 1
        triggerTimers[2] = timer3 - 1
      } else {
        out3[i] = 0
      }
      const timer4 = triggerTimers[3] ?? 0
      if (timer4 > 0) {
        out4[i] = 1
        triggerTimers[3] = timer4 - 1
      } else {
        out4[i] = 0
      }

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
