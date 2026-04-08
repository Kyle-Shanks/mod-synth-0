export interface LogSpectrumKernel {
  fftSize: number
  nBands: number
  sampleRate: number
  frequencies: Float32Array
  barCenterBinPos: Float32Array
  minFreq: number
  maxFreq: number
  fftTwiddleCos: Float32Array
  fftTwiddleSin: Float32Array
  fftBitReverse: Uint16Array
  binBarA: Int16Array
  binBarB: Int16Array
  binWeightA: Float32Array
  binWeightB: Float32Array
  window: Float32Array
}

interface KernelOptions {
  fftSize: number
  nBands: number
  sampleRate: number
  minFreq: number
  maxFreq: number
}

interface AnalyzeOptions {
  scopeBuffer: Float32Array
  writeIndex: number
  kernel: LogSpectrumKernel
  frameScratch: Float32Array
  fftRealScratch: Float32Array
  fftImagScratch: Float32Array
  bandPowerScratch: Float32Array
  bandPeakScratch: Float32Array
  bandWeightScratch: Float32Array
  smoothedOutput: Float32Array
  minDb: number
  attack: number
  release: number
  removeDc?: boolean
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function wrapRingIndex(index: number, ringLength: number): number {
  let wrapped = index % ringLength
  if (wrapped < 0) wrapped += ringLength
  return wrapped
}

export function createLogSpectrumKernel({
  fftSize,
  nBands,
  sampleRate,
  minFreq,
  maxFreq,
}: KernelOptions): LogSpectrumKernel {
  const safeFftSize = Math.max(8, Math.floor(fftSize))
  if ((safeFftSize & (safeFftSize - 1)) !== 0) {
    throw new Error('fftSize must be a power of two')
  }
  const safeBands = Math.max(1, Math.floor(nBands))
  const nyquist = sampleRate * 0.5 * 0.98
  const low = Math.max(1, Math.min(minFreq, nyquist - 1))
  const high = Math.max(low + 1, Math.min(maxFreq, nyquist))
  const logMin = Math.log10(low)
  const logMax = Math.log10(high)
  const twoPi = Math.PI * 2

  const frequencies = new Float32Array(safeBands)
  const barCenterBinPos = new Float32Array(safeBands)
  const window = new Float32Array(safeFftSize)
  const fftTwiddleCos = new Float32Array(safeFftSize / 2)
  const fftTwiddleSin = new Float32Array(safeFftSize / 2)
  const fftBitReverse = new Uint16Array(safeFftSize)
  const binBarA = new Int16Array(safeFftSize / 2 + 1)
  const binBarB = new Int16Array(safeFftSize / 2 + 1)
  const binWeightA = new Float32Array(safeFftSize / 2 + 1)
  const binWeightB = new Float32Array(safeFftSize / 2 + 1)

  // 4-term Blackman-Harris for low sidelobes in live display contexts.
  const a0 = 0.35875
  const a1 = 0.48829
  const a2 = 0.14128
  const a3 = 0.01168
  for (let i = 0; i < safeFftSize; i++) {
    const phase = (twoPi * i) / (safeFftSize - 1)
    window[i] =
      a0
      - a1 * Math.cos(phase)
      + a2 * Math.cos(2 * phase)
      - a3 * Math.cos(3 * phase)
  }

  for (let i = 0; i < safeFftSize / 2; i++) {
    const phase = (twoPi * i) / safeFftSize
    fftTwiddleCos[i] = Math.cos(phase)
    fftTwiddleSin[i] = -Math.sin(phase)
  }

  const nBits = Math.round(Math.log2(safeFftSize))
  for (let i = 0; i < safeFftSize; i++) {
    let reversed = 0
    let value = i
    for (let bit = 0; bit < nBits; bit++) {
      reversed = (reversed << 1) | (value & 1)
      value >>= 1
    }
    fftBitReverse[i] = reversed
  }

  for (let band = 0; band < safeBands; band++) {
    const t = safeBands > 1 ? band / (safeBands - 1) : 0
    const centerFreq = Math.pow(10, logMin + t * (logMax - logMin))
    barCenterBinPos[band] = Math.max(
      1,
      Math.min(safeFftSize / 2 - 1, (centerFreq * safeFftSize) / sampleRate),
    )
  }

  // At very low frequencies, pure log spacing can place neighboring bars closer
  // than FFT bin resolution, producing clumping and apparent dead bars.
  // Enforce a minimum center spacing in bin-space, then rescale to fit.
  if (safeBands > 1) {
    const minBinStep = 0.75
    for (let band = 1; band < safeBands; band++) {
      const prev = barCenterBinPos[band - 1] ?? 1
      const curr = barCenterBinPos[band] ?? prev
      if (curr - prev < minBinStep) {
        barCenterBinPos[band] = prev + minBinStep
      }
    }

    const first = barCenterBinPos[0] ?? 1
    const last = barCenterBinPos[safeBands - 1] ?? first
    const maxBin = safeFftSize / 2 - 1
    if (last > maxBin && last > first + 1e-6) {
      const scale = (maxBin - first) / (last - first)
      for (let band = 1; band < safeBands; band++) {
        const value = barCenterBinPos[band] ?? first
        barCenterBinPos[band] = first + (value - first) * scale
      }
    }
  }

  for (let band = 0; band < safeBands; band++) {
    const centerBin = barCenterBinPos[band] ?? 1
    frequencies[band] = (centerBin * sampleRate) / safeFftSize
  }

  for (let bin = 0; bin <= safeFftSize / 2; bin++) {
    const freq = (bin * sampleRate) / safeFftSize
    if (freq < low || freq > high || bin === 0 || bin === safeFftSize / 2) {
      binBarA[bin] = -1
      binBarB[bin] = -1
      binWeightA[bin] = 0
      binWeightB[bin] = 0
      continue
    }

    if (safeBands === 1) {
      binBarA[bin] = 0
      binBarB[bin] = 0
      binWeightA[bin] = 1
      binWeightB[bin] = 0
      continue
    }

    let rightBar = 1
    while (
      rightBar < safeBands &&
      (barCenterBinPos[rightBar] ?? Number.POSITIVE_INFINITY) < bin
    ) {
      rightBar++
    }
    if (rightBar >= safeBands) rightBar = safeBands - 1
    const leftBar = Math.max(0, rightBar - 1)

    const leftCenter = barCenterBinPos[leftBar] ?? bin
    const rightCenter = barCenterBinPos[rightBar] ?? leftCenter
    const span = Math.max(1e-6, rightCenter - leftCenter)
    const frac = Math.max(0, Math.min(1, (bin - leftCenter) / span))

    binBarA[bin] = leftBar
    binBarB[bin] = rightBar
    binWeightA[bin] = 1 - frac
    binWeightB[bin] = rightBar === leftBar ? 0 : frac
  }

  return {
    fftSize: safeFftSize,
    nBands: safeBands,
    sampleRate,
    frequencies,
    barCenterBinPos,
    minFreq: low,
    maxFreq: high,
    fftTwiddleCos,
    fftTwiddleSin,
    fftBitReverse,
    binBarA,
    binBarB,
    binWeightA,
    binWeightB,
    window,
  }
}

function fftInPlace(
  real: Float32Array,
  imag: Float32Array,
  twiddleCos: Float32Array,
  twiddleSin: Float32Array,
): void {
  const n = real.length
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1
    const step = n / size
    for (let start = 0; start < n; start += size) {
      let k = 0
      for (let j = 0; j < half; j++) {
        const i0 = start + j
        const i1 = i0 + half
        const wr = twiddleCos[k] ?? 0
        const wi = twiddleSin[k] ?? 0
        const r1 = real[i1] ?? 0
        const im1 = imag[i1] ?? 0
        const tr = wr * r1 - wi * im1
        const ti = wr * im1 + wi * r1
        const ur = real[i0] ?? 0
        const ui = imag[i0] ?? 0

        real[i0] = ur + tr
        imag[i0] = ui + ti
        real[i1] = ur - tr
        imag[i1] = ui - ti

        k += step
      }
    }
  }
}

export function analyzeLogSpectrum({
  scopeBuffer,
  writeIndex,
  kernel,
  frameScratch,
  fftRealScratch,
  fftImagScratch,
  bandPowerScratch,
  bandPeakScratch,
  bandWeightScratch,
  smoothedOutput,
  minDb,
  attack,
  release,
  removeDc = true,
}: AnalyzeOptions): boolean {
  const fftSize = kernel.fftSize
  if (scopeBuffer.length < fftSize) return false
  if (frameScratch.length < fftSize) return false
  if (fftRealScratch.length < fftSize) return false
  if (fftImagScratch.length < fftSize) return false
  if (bandPowerScratch.length < kernel.nBands) return false
  if (bandPeakScratch.length < kernel.nBands) return false
  if (bandWeightScratch.length < kernel.nBands) return false
  if (smoothedOutput.length < kernel.nBands) return false

  const ringLength = scopeBuffer.length
  const ringStart = writeIndex - fftSize
  const safeMinDb = Math.min(-1, minDb)
  const attackCoeff = clamp01(attack)
  const releaseCoeff = clamp01(release)

  let mean = 0
  for (let i = 0; i < fftSize; i++) {
    const ringIndex = wrapRingIndex(ringStart + i, ringLength)
    const sample = scopeBuffer[ringIndex] ?? 0
    frameScratch[i] = sample
    mean += sample
  }

  if (removeDc) {
    mean /= fftSize
  } else {
    mean = 0
  }

  for (let i = 0; i < fftSize; i++) {
    const centered = (frameScratch[i] ?? 0) - mean
    const orderedIndex = kernel.fftBitReverse[i] ?? i
    fftRealScratch[orderedIndex] = centered * (kernel.window[i] ?? 0)
    fftImagScratch[orderedIndex] = 0
  }

  fftInPlace(
    fftRealScratch,
    fftImagScratch,
    kernel.fftTwiddleCos,
    kernel.fftTwiddleSin,
  )

  for (let band = 0; band < kernel.nBands; band++) {
    bandPowerScratch[band] = 0
    bandPeakScratch[band] = 0
    bandWeightScratch[band] = 0
  }

  for (let bin = 1; bin < fftSize / 2; bin++) {
    const barA = kernel.binBarA[bin] ?? -1
    if (barA < 0) continue

    const re = fftRealScratch[bin] ?? 0
    const im = fftImagScratch[bin] ?? 0
    const power = re * re + im * im

    const weightA = kernel.binWeightA[bin] ?? 0
    if (weightA > 0) {
      const weightedA = power * weightA
      bandPowerScratch[barA] = (bandPowerScratch[barA] ?? 0) + weightedA
      if (weightedA > (bandPeakScratch[barA] ?? 0)) {
        bandPeakScratch[barA] = weightedA
      }
      bandWeightScratch[barA] = (bandWeightScratch[barA] ?? 0) + weightA
    }

    const barB = kernel.binBarB[bin] ?? -1
    const weightB = kernel.binWeightB[bin] ?? 0
    if (barB >= 0 && barB !== barA && weightB > 0) {
      const weightedB = power * weightB
      bandPowerScratch[barB] = (bandPowerScratch[barB] ?? 0) + weightedB
      if (weightedB > (bandPeakScratch[barB] ?? 0)) {
        bandPeakScratch[barB] = weightedB
      }
      bandWeightScratch[barB] = (bandWeightScratch[barB] ?? 0) + weightB
    }
  }

  const invFft = 1 / fftSize
  const dbRangeScale = -1 / safeMinDb
  for (let band = 0; band < kernel.nBands; band++) {
    const totalWeight = bandWeightScratch[band] ?? 0
    const averagePower =
      totalWeight > 1e-6 ? (bandPowerScratch[band] ?? 0) / totalWeight : 0
    const peakPower = bandPeakScratch[band] ?? 0

    // Center-frequency interpolation keeps bars responsive even when a very
    // narrow low-frequency band collects little/no weighted bin coverage.
    const centerPos = kernel.barCenterBinPos[band] ?? 1
    const leftBin = Math.max(1, Math.min(fftSize / 2 - 1, Math.floor(centerPos)))
    const rightBin = Math.max(leftBin, Math.min(fftSize / 2 - 1, leftBin + 1))
    const frac = centerPos - leftBin
    const leftRe = fftRealScratch[leftBin] ?? 0
    const leftIm = fftImagScratch[leftBin] ?? 0
    const rightRe = fftRealScratch[rightBin] ?? leftRe
    const rightIm = fftImagScratch[rightBin] ?? leftIm
    const leftPower = leftRe * leftRe + leftIm * leftIm
    const rightPower = rightRe * rightRe + rightIm * rightIm
    const centerPower = leftPower + (rightPower - leftPower) * frac

    // Hybrid bar estimate:
    // - average power keeps overall stability
    // - peak power reduces "clumped" plateaus in neighboring low bars
    // - center interpolation prevents dead bars when weighted coverage is sparse
    const spectralPower =
      totalWeight > 1e-6
        ? averagePower * 0.42 + peakPower * 0.58
        : peakPower
    const blendedPower =
      totalWeight > 1e-6
        ? spectralPower * 0.9 + centerPower * 0.1
        : centerPower
    const magnitude = Math.sqrt(Math.max(0, blendedPower)) * invFft
    const db = 20 * Math.log10(magnitude + 1e-6)
    const normalized = clamp01((db - safeMinDb) * dbRangeScale)
    const prev = smoothedOutput[band] ?? 0
    const coeff = normalized > prev ? attackCoeff : releaseCoeff
    smoothedOutput[band] = prev + (normalized - prev) * coeff
  }

  return true
}
