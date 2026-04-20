import type { ModuleDefinition } from '../../engine/types'

interface SamplerState {
  sampleBuffer: Float32Array | null
  sampleRate: number
  playhead: number
  playing: boolean
  manualPlay: boolean
  triggerWasHigh: boolean
  playheadBuffer: Int32Array | null
  _samplerTrigger: number
  _samplerStop: number
  [key: string]: unknown
}

export const SamplerDefinition: ModuleDefinition<
  {
    trigger: { type: 'gate'; default: 0; label: 'gate' }
    pitch: { type: 'cv'; default: 0; label: 'v/oct' }
  },
  {
    out: { type: 'audio'; default: 0; label: 'out' }
  },
  {
    start: { type: 'float'; min: 0; max: 0.99; default: 0; label: 'start' }
    end: { type: 'float'; min: 0.01; max: 1; default: 1; label: 'end' }
    mode: {
      type: 'select'
      default: 0
      label: 'mode'
      options: ['one-shot', 'gate', 'retrigger']
    }
    rate: {
      type: 'float'
      min: 0.25
      max: 4
      default: 1
      label: 'rate'
      curve: 'log'
    }
    level: { type: 'float'; min: 0; max: 1; default: 0.8; label: 'level' }
    loop: { type: 'boolean'; default: 0; label: 'loop' }
    reverse: { type: 'boolean'; default: 0; label: 'reverse' }
  },
  SamplerState
> = {
  id: 'sampler',
  name: 'sampler',
  category: 'source',
  width: 6,
  height: 7,

  inputs: {
    trigger: { type: 'gate', default: 0, label: 'gate' },
    pitch: { type: 'cv', default: 0, label: 'v/oct' },
  },
  outputs: {
    out: { type: 'audio', default: 0, label: 'out' },
  },
  params: {
    start: { type: 'float', min: 0, max: 0.99, default: 0, label: 'start' },
    end: { type: 'float', min: 0.01, max: 1, default: 1, label: 'end' },
    mode: {
      type: 'select',
      default: 0,
      label: 'mode',
      options: ['one-shot', 'gate', 'retrigger'],
    },
    rate: {
      type: 'float',
      min: 0.25,
      max: 4,
      default: 1,
      label: 'rate',
      curve: 'log',
    },
    level: { type: 'float', min: 0, max: 1, default: 0.8, label: 'level' },
    loop: { type: 'boolean', default: 0, label: 'loop' },
    reverse: { type: 'boolean', default: 0, label: 'reverse' },
  },

  initialize(context): SamplerState {
    return {
      sampleBuffer: null,
      sampleRate: context.sampleRate,
      playhead: 0,
      playing: false,
      manualPlay: false,
      triggerWasHigh: false,
      playheadBuffer: null,
      _samplerTrigger: 0,
      _samplerStop: 0,
    }
  },

  process(inputs, outputs, params, state, context) {
    const sampleBuffer = state.sampleBuffer as Float32Array | null
    const playheadBuffer = state.playheadBuffer as Int32Array | null
    const hasSample = !!sampleBuffer && sampleBuffer.length > 1

    let playhead = state.playhead as number
    let playing = state.playing as boolean
    let manualPlay = state.manualPlay as boolean
    let triggerWasHigh = state.triggerWasHigh as boolean

    const stopRequested = (state._samplerStop as number) === 1
    let manualTrigger = (state._samplerTrigger as number) === 1
    state._samplerStop = 0
    state._samplerTrigger = 0

    const modeIndex = Math.max(0, Math.min(2, Math.round(params.mode)))
    const gateMode = modeIndex === 1
    const retriggerMode = modeIndex === 2
    const reverse = params.reverse >= 0.5
    const level = Math.max(0, Math.min(1, params.level))
    const loopEnabled = params.loop >= 0.5
    const baseRate = Math.max(0.01, params.rate)

    if (stopRequested) {
      playing = false
      manualPlay = false
    }

    let startIndex = 0
    let endIndex = 1
    let segmentLength = 1
    let idleHead = 0
    const sampleLength = sampleBuffer?.length ?? 0

    if (hasSample) {
      const lastIndex = Math.max(1, sampleLength - 1)
      const startNorm = Math.max(0, Math.min(0.999, params.start))
      const endNorm = Math.max(0.001, Math.min(1, params.end))
      const clampedStartNorm = Math.min(startNorm, endNorm - 0.001)
      const clampedEndNorm = Math.max(endNorm, clampedStartNorm + 0.001)

      startIndex = Math.max(
        0,
        Math.min(lastIndex - 1, Math.floor(clampedStartNorm * lastIndex)),
      )
      endIndex = Math.max(
        startIndex + 1,
        Math.min(sampleLength, Math.floor(clampedEndNorm * lastIndex)),
      )
      segmentLength = Math.max(1, endIndex - startIndex)
      idleHead = reverse ? Math.max(startIndex, endIndex - 1) : startIndex

      if (!playing) {
        playhead = idleHead
      } else if (playhead < startIndex || playhead >= endIndex) {
        if (loopEnabled && !manualPlay) {
          let wrapped = (playhead - startIndex) % segmentLength
          if (wrapped < 0) wrapped += segmentLength
          playhead = startIndex + wrapped
        } else {
          playing = false
          manualPlay = false
          playhead = idleHead
        }
      }
    }

    const sampleRateRatio = Math.max(
      0.0001,
      ((state.sampleRate as number) || context.sampleRate) / context.sampleRate,
    )

    for (let i = 0; i < 128; i++) {
      const trigHigh = (inputs.trigger[i] ?? 0) > 0.5
      const trigRising = trigHigh && !triggerWasHigh

      if (manualTrigger && hasSample) {
        playhead = idleHead
        playing = true
        manualPlay = true
        manualTrigger = false
      }

      if (trigRising && hasSample) {
        if (retriggerMode || gateMode) {
          playhead = idleHead
          playing = true
          manualPlay = false
        } else if (!playing) {
          playhead = idleHead
          playing = true
          manualPlay = false
        }
      }

      if (gateMode && !manualPlay && !trigHigh) {
        playing = false
        playhead = idleHead
      }

      triggerWasHigh = trigHigh

      if (!playing || !hasSample || !sampleBuffer) {
        outputs.out[i] = 0
        continue
      }

      const pitchCv = inputs.pitch[i] ?? 0
      const stepMagnitude =
        Math.max(0.0001, baseRate * Math.pow(2, pitchCv)) * sampleRateRatio
      const direction = reverse ? -1 : 1
      const step = stepMagnitude * direction
      const index = Math.max(startIndex, Math.min(endIndex - 1, playhead))
      const baseIndex = Math.floor(index)
      const frac = index - baseIndex
      const effectiveLoop = loopEnabled && !manualPlay
      const nextIndex = reverse
        ? baseIndex - 1 >= startIndex
          ? baseIndex - 1
          : effectiveLoop
            ? endIndex - 1
            : baseIndex
        : baseIndex + 1 < endIndex
          ? baseIndex + 1
          : effectiveLoop
            ? startIndex
            : baseIndex

      const s0 = sampleBuffer[baseIndex] ?? 0
      const s1 = sampleBuffer[nextIndex] ?? s0
      outputs.out[i] = (s0 + (s1 - s0) * frac) * level

      playhead += step

      if (!reverse) {
        if (playhead >= endIndex) {
          if (effectiveLoop) {
            let wrapped = (playhead - startIndex) % segmentLength
            if (wrapped < 0) wrapped += segmentLength
            playhead = startIndex + wrapped
          } else {
            playing = false
            manualPlay = false
            playhead = idleHead
          }
        }
      } else if (playhead < startIndex) {
        if (effectiveLoop) {
          let wrapped = (endIndex - 1 - playhead) % segmentLength
          if (wrapped < 0) wrapped += segmentLength
          playhead = endIndex - 1 - wrapped
        } else {
          playing = false
          manualPlay = false
          playhead = idleHead
        }
      }
    }

    state.playhead = playhead
    state.playing = playing
    state.manualPlay = manualPlay
    state.triggerWasHigh = triggerWasHigh

    if (playheadBuffer) {
      const writeIndex =
        hasSample && sampleLength > 0
          ? Math.max(0, Math.min(sampleLength - 1, Math.floor(playhead)))
          : 0
      Atomics.store(playheadBuffer, 0, writeIndex)
      Atomics.store(playheadBuffer, 1, playing ? 1 : 0)
    }
  },
}
