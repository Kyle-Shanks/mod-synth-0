import type { ModuleDefinition } from '../../engine/types'

interface GranulatorState {
  buffer: Float32Array
  writeIdx: number
  spawnCounter: number
  nextGrain: number
  grainActive: Uint8Array
  grainAge: Int32Array
  grainDuration: Int32Array
  grainReadPos: Float32Array
  grainStep: Float32Array
  grainGain: Float32Array
  grainDirection: Float32Array
  toneState: number
  heldSample: number
  holdCounter: number
  lastWet: number
  activeGrainCount: number
  [key: string]: unknown
}

export const GranulatorDefinition: ModuleDefinition<
  {
    audio: { type: 'audio'; default: 0; label: 'in' }
    freeze: { type: 'gate'; default: 0; label: 'freeze' }
    positionCv: { type: 'cv'; default: 0; label: 'pos' }
    pitchCv: { type: 'cv'; default: 0; label: 'pitch' }
  },
  {
    out: { type: 'audio'; default: 0; label: 'out' }
  },
  {
    mode: {
      type: 'select'
      default: 0
      options: ['hybrid', 'ambient', 'glitch']
      label: 'mode'
    }
    position: { type: 'float'; min: 0; max: 1; default: 0.35; label: 'pos' }
    size: {
      type: 'float'
      min: 0.005
      max: 1.2
      default: 0.12
      label: 'size'
      unit: 's'
      curve: 'log'
    }
    density: {
      type: 'float'
      min: 0.5
      max: 120
      default: 8
      label: 'dens'
      unit: 'hz'
    }
    spread: { type: 'float'; min: 0; max: 1; default: 0.45; label: 'sprd' }
    pitch: {
      type: 'float'
      min: -2400
      max: 2400
      default: 0
      label: 'pitch'
      unit: 'ct'
    }
    jitter: { type: 'float'; min: 0; max: 1; default: 0.35; label: 'jitr' }
    reverse: { type: 'float'; min: 0; max: 1; default: 0.15; label: 'rev' }
    shape: { type: 'float'; min: 0; max: 1; default: 0.15; label: 'shape' }
    tone: {
      type: 'float'
      min: 200
      max: 14000
      default: 9000
      label: 'tone'
      unit: 'hz'
      curve: 'log'
    }
    feedback: { type: 'float'; min: 0; max: 0.95; default: 0.2; label: 'fdbk' }
    crush: { type: 'float'; min: 0; max: 1; default: 0; label: 'crush' }
    mix: { type: 'float'; min: 0; max: 1; default: 0.7; label: 'mix' }
  },
  GranulatorState
> = {
  id: 'granulator',
  name: 'granulator',
  category: 'fx',
  width: 6,
  height: 5,

  inputs: {
    audio: { type: 'audio', default: 0, label: 'in' },
    freeze: { type: 'gate', default: 0, label: 'freeze' },
    positionCv: { type: 'cv', default: 0, label: 'pos' },
    pitchCv: { type: 'cv', default: 0, label: 'pitch' },
  },
  outputs: {
    out: { type: 'audio', default: 0, label: 'out' },
  },
  params: {
    mode: {
      type: 'select',
      default: 0,
      options: ['hybrid', 'ambient', 'glitch'],
      label: 'mode',
    },
    position: { type: 'float', min: 0, max: 1, default: 0.35, label: 'pos' },
    size: {
      type: 'float',
      min: 0.005,
      max: 1.2,
      default: 0.12,
      label: 'size',
      unit: 's',
      curve: 'log',
    },
    density: {
      type: 'float',
      min: 0.5,
      max: 120,
      default: 8,
      label: 'dens',
      unit: 'hz',
    },
    spread: { type: 'float', min: 0, max: 1, default: 0.45, label: 'sprd' },
    pitch: {
      type: 'float',
      min: -2400,
      max: 2400,
      default: 0,
      label: 'pitch',
      unit: 'ct',
    },
    jitter: { type: 'float', min: 0, max: 1, default: 0.35, label: 'jitr' },
    reverse: { type: 'float', min: 0, max: 1, default: 0.15, label: 'rev' },
    shape: { type: 'float', min: 0, max: 1, default: 0.15, label: 'shape' },
    tone: {
      type: 'float',
      min: 200,
      max: 14000,
      default: 9000,
      label: 'tone',
      unit: 'hz',
      curve: 'log',
    },
    feedback: { type: 'float', min: 0, max: 0.95, default: 0.2, label: 'fdbk' },
    crush: { type: 'float', min: 0, max: 1, default: 0, label: 'crush' },
    mix: { type: 'float', min: 0, max: 1, default: 0.7, label: 'mix' },
  },

  initialize(context): GranulatorState {
    const historySeconds = 2
    const historySamples = Math.max(2048, Math.round(context.sampleRate * historySeconds))
    const maxGrains = 48

    return {
      buffer: new Float32Array(historySamples),
      writeIdx: 0,
      spawnCounter: 0,
      nextGrain: 0,
      grainActive: new Uint8Array(maxGrains),
      grainAge: new Int32Array(maxGrains),
      grainDuration: new Int32Array(maxGrains),
      grainReadPos: new Float32Array(maxGrains),
      grainStep: new Float32Array(maxGrains),
      grainGain: new Float32Array(maxGrains),
      grainDirection: new Float32Array(maxGrains),
      toneState: 0,
      heldSample: 0,
      holdCounter: 0,
      lastWet: 0,
      activeGrainCount: 0,
    }
  },

  process(inputs, outputs, params, state, context) {
    const buffer = state.buffer as Float32Array
    const grainActive = state.grainActive as Uint8Array
    const grainAge = state.grainAge as Int32Array
    const grainDuration = state.grainDuration as Int32Array
    const grainReadPos = state.grainReadPos as Float32Array
    const grainStep = state.grainStep as Float32Array
    const grainGain = state.grainGain as Float32Array
    const grainDirection = state.grainDirection as Float32Array

    const sampleRate = context.sampleRate
    const bufferLength = buffer.length
    const grainCount = grainActive.length
    const twoPi = 2 * Math.PI

    let writeIdx = state.writeIdx as number
    let spawnCounter = state.spawnCounter as number
    let nextGrain = state.nextGrain as number
    let toneState = state.toneState as number
    let heldSample = state.heldSample as number
    let holdCounter = state.holdCounter as number
    let lastWet = state.lastWet as number
    let activeGrainCount = Math.max(
      0,
      Math.round(state.activeGrainCount as number) || 0,
    )

    const mode = Math.round(params.mode)
    const modeDensityScale = mode === 1 ? 0.75 : mode === 2 ? 1.3 : 1
    const modeSizeScale = mode === 1 ? 1.8 : mode === 2 ? 0.38 : 1
    const modeJitterBoost = mode === 1 ? 0.15 : mode === 2 ? 0.35 : 0
    const modeReverseBias = mode === 1 ? 0.1 : mode === 2 ? 0.45 : 0

    const intervalSamples =
      sampleRate / Math.max(0.5, Math.min(120, params.density * modeDensityScale))
    const baseSizeSamples = Math.max(8, Math.min(bufferLength - 2, Math.round(params.size * modeSizeScale * sampleRate)))
    const baseOffsetSamples = Math.max(
      1,
      Math.min(
        bufferLength - 2,
        Math.round((0.02 + params.position * 1.6) * sampleRate),
      ),
    )
    const spreadSamples = Math.round(params.spread * sampleRate * 0.6)
    const basePitchRatio = Math.pow(2, params.pitch / 1200)
    const jitter = Math.max(0, Math.min(1, params.jitter + modeJitterBoost))
    const reverseChance = Math.max(0, Math.min(1, params.reverse + modeReverseBias))
    const shape = Math.max(0, Math.min(1, params.shape))
    const toneCoeff = Math.exp((-2 * Math.PI * Math.max(200, params.tone)) / sampleRate)
    const feedback = Math.max(0, Math.min(0.95, params.feedback))
    const crush = Math.max(0, Math.min(1, params.crush))
    const holdSamples = Math.max(1, Math.round(1 + crush * crush * 140))
    const spawnLimitPerSample = mode === 2 ? 5 : 3
    const maxActiveGrains = Math.max(6, Math.round(grainCount * (0.22 + (1 - shape) * 0.78)))

    for (let i = 0; i < 128; i++) {
      const input = inputs.audio[i] ?? 0
      const freezeHigh = (inputs.freeze[i] ?? 0) > 0.5

      if (!freezeHigh) {
        buffer[writeIdx] = input + lastWet * feedback
      }

      spawnCounter -= 1
      const posCv = inputs.positionCv[i] ?? 0
      const pitchCv = inputs.pitchCv[i] ?? 0

      let spawnSafety = 0
      while (spawnCounter <= 0 && spawnSafety < spawnLimitPerSample) {
        spawnSafety++
        const slot = nextGrain
        nextGrain = (nextGrain + 1) % grainCount

        if (activeGrainCount >= maxActiveGrains) {
          spawnCounter += intervalSamples * 0.5
          continue
        }

        const cvOffsetSamples = posCv * sampleRate * 0.35
        const randomOffset = (Math.random() * 2 - 1) * spreadSamples * (0.35 + jitter * 1.3)
        const offset = Math.max(
          1,
          Math.min(
            bufferLength - 2,
            Math.round(baseOffsetSamples + cvOffsetSamples + randomOffset),
          ),
        )

        let readPos = writeIdx - offset
        if (readPos < 0) readPos += bufferLength

        const durationScale = 1 + (Math.random() * 2 - 1) * (0.15 + jitter * 0.95)
        const duration = Math.max(
          mode === 2 ? 6 : 10,
          Math.min(bufferLength - 2, Math.round(baseSizeSamples * durationScale)),
        )

        const randomCents = (Math.random() * 2 - 1) * params.spread * (10 + jitter * 120)
        const octaveJump = mode === 2 && Math.random() < jitter * 0.45
          ? (Math.random() < 0.5 ? -12 : 12)
          : 0
        const pitchRatio = basePitchRatio * Math.pow(2, pitchCv + randomCents / 1200)
        const quantizedRatio =
          mode === 2
            ? Math.pow(2, Math.round((Math.log(pitchRatio) / Math.log(2)) * 12 + octaveJump) / 12)
            : pitchRatio
        const reverse = Math.random() < reverseChance ? -1 : 1
        const gain = 0.35 + Math.random() * 0.85

        const slotWasActive = (grainActive[slot] ?? 0) === 1
        grainActive[slot] = 1
        grainAge[slot] = 0
        grainDuration[slot] = duration
        grainReadPos[slot] = readPos
        grainStep[slot] = quantizedRatio
        grainDirection[slot] = reverse
        grainGain[slot] = gain
        if (!slotWasActive) activeGrainCount++

        const jitterInterval = intervalSamples * (1 + (Math.random() * 2 - 1) * jitter * 0.85)
        spawnCounter += Math.max(1, jitterInterval)
      }

      let wet = 0
      let activeCount = 0

      for (let g = 0; g < grainCount; g++) {
        if ((grainActive[g] ?? 0) !== 1) continue

        const age = grainAge[g] ?? 0
        const duration = grainDuration[g] ?? 1

        if (age >= duration) {
          if ((grainActive[g] ?? 0) === 1) {
            grainActive[g] = 0
            if (activeGrainCount > 0) activeGrainCount--
          }
          continue
        }

        const readPos = grainReadPos[g] ?? 0
        const readIndex = Math.floor(readPos)
        const readNext = (readIndex + 1) % bufferLength
        const frac = readPos - readIndex

        const s0 = buffer[readIndex] ?? 0
        const s1 = buffer[readNext] ?? 0
        const sample = s0 + (s1 - s0) * frac

        const envelopePhase = age / duration
        const hann = 0.5 - 0.5 * Math.cos(envelopePhase * twoPi)
        const hardEnv = mode === 2
          ? envelopePhase < 0.9 ? 1 : (1 - envelopePhase) * 10
          : 1
        const envelope = hann * (1 - shape) + hardEnv * shape
        wet += sample * envelope * (grainGain[g] ?? 1)
        activeCount++

        let nextRead = readPos + (grainStep[g] ?? 1) * (grainDirection[g] ?? 1)
        while (nextRead >= bufferLength) nextRead -= bufferLength
        while (nextRead < 0) nextRead += bufferLength
        grainReadPos[g] = nextRead

        const nextAge = age + 1
        grainAge[g] = nextAge
        if (nextAge >= duration && (grainActive[g] ?? 0) === 1) {
          grainActive[g] = 0
          if (activeGrainCount > 0) activeGrainCount--
        }
      }

      const wetNorm = activeCount > 0 ? wet / Math.sqrt(activeCount) : 0
      toneState = (1 - toneCoeff) * wetNorm + toneCoeff * toneState
      const shapedWet = Math.tanh(toneState * 1.25)
      if (holdCounter <= 0) {
        heldSample = shapedWet
        holdCounter = holdSamples
      } else {
        holdCounter--
      }
      const crushedWet = shapedWet * (1 - crush) + heldSample * crush
      const mix = Math.max(0, Math.min(1, params.mix))
      const output = input * (1 - mix) + crushedWet * mix
      outputs.out[i] = output
      lastWet = crushedWet

      writeIdx++
      if (writeIdx >= bufferLength) writeIdx = 0
    }

    state.writeIdx = writeIdx
    state.spawnCounter = spawnCounter
    state.nextGrain = nextGrain
    state.toneState = toneState
    state.heldSample = heldSample
    state.holdCounter = holdCounter
    state.lastWet = lastWet
    state.activeGrainCount = activeGrainCount
  },
}
