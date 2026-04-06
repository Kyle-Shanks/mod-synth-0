import { useMemo, useEffect, useCallback, useRef } from 'react'
import { useStore } from '../../store'
import { getModule } from '../registry'
import { CanvasZone } from '../../components/CanvasZone'
import type { CanvasData } from '../../components/CanvasZone'
import { drawGrid } from '../../components/canvasPrimitives'
import { ListSelector } from '../../components/ListSelector'
import { GRID_UNIT } from '../../theme/tokens'

interface SpectrumPanelProps {
  moduleId: string
}

const NORMAL_FFT_SIZE = 256
const NORMAL_BIN_COUNT = 72
const NORMAL_MIN_DB = -72

const HIGH_FFT_SIZE = 512
const HIGH_BIN_COUNT = 128
const HIGH_MIN_DB = -84

interface SpectrumKernel {
  fftSize: number
  binCount: number
  minDb: number
  window: Float32Array
  cosTable: Float32Array
  sinTable: Float32Array
}

function createSpectrumKernel(
  fftSize: number,
  binCount: number,
  minDb: number,
): SpectrumKernel {
  const window = new Float32Array(fftSize)
  const cosTable = new Float32Array(binCount * fftSize)
  const sinTable = new Float32Array(binCount * fftSize)

  const fftUpperBin = fftSize / 2 - 2
  const twoPi = Math.PI * 2

  for (let i = 0; i < fftSize; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((twoPi * i) / (fftSize - 1))
  }

  for (let bin = 0; bin < binCount; bin++) {
    const logNorm = Math.pow(bin / Math.max(1, binCount - 1), 2.1)
    const fftBin = 1 + Math.floor(logNorm * fftUpperBin)
    const rowOffset = bin * fftSize

    for (let i = 0; i < fftSize; i++) {
      const phase = (twoPi * fftBin * i) / fftSize
      cosTable[rowOffset + i] = Math.cos(phase)
      sinTable[rowOffset + i] = Math.sin(phase)
    }
  }

  return { fftSize, binCount, minDb, window, cosTable, sinTable }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function SpectrumPanel({ moduleId }: SpectrumPanelProps) {
  const mod = useStore((s) => s.modules[moduleId])
  const def = mod ? getModule(mod.definitionId) : undefined
  const engineRevision = useStore((s) => s.engineRevision)
  const setScopeBuffers = useStore((s) => s.setScopeBuffers)

  const normalKernel = useMemo(
    () =>
      createSpectrumKernel(NORMAL_FFT_SIZE, NORMAL_BIN_COUNT, NORMAL_MIN_DB),
    [],
  )
  const highKernel = useMemo(
    () => createSpectrumKernel(HIGH_FFT_SIZE, HIGH_BIN_COUNT, HIGH_MIN_DB),
    [],
  )

  const normalSmoothedRef = useRef(new Float32Array(NORMAL_BIN_COUNT))
  const normalXPointsRef = useRef(new Float32Array(NORMAL_BIN_COUNT))
  const normalYPointsRef = useRef(new Float32Array(NORMAL_BIN_COUNT))
  const highSmoothedRef = useRef(new Float32Array(HIGH_BIN_COUNT))
  const highXPointsRef = useRef(new Float32Array(HIGH_BIN_COUNT))
  const highYPointsRef = useRef(new Float32Array(HIGH_BIN_COUNT))

  const scopeBuffers = useMemo(() => {
    try {
      const sab = new SharedArrayBuffer(4096 * Float32Array.BYTES_PER_ELEMENT)
      const idxSab = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
      return {
        scopeBuffer: new Float32Array(sab),
        writeIndexBuffer: new Int32Array(idxSab),
      }
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    if (!scopeBuffers) return
    setScopeBuffers(
      moduleId,
      scopeBuffers.scopeBuffer.buffer as SharedArrayBuffer,
      scopeBuffers.writeIndexBuffer.buffer as SharedArrayBuffer,
    )
  }, [moduleId, scopeBuffers, engineRevision, setScopeBuffers])

  const qualityIndex = Math.round(mod?.params.quality ?? 1)
  const highQuality = qualityIndex === 1
  const qualityParam = def?.params.quality

  const renderSpectrum = useCallback(
    (ctx: CanvasRenderingContext2D, data: CanvasData) => {
      const { width, height, theme, scopeBuffer, writeIndexBuffer } = data
      const kernel = highQuality ? highKernel : normalKernel
      const { fftSize, binCount, minDb, window, cosTable, sinTable } = kernel

      const smoothed = highQuality
        ? highSmoothedRef.current
        : normalSmoothedRef.current
      const xPoints = highQuality
        ? highXPointsRef.current
        : normalXPointsRef.current
      const yPoints = highQuality
        ? highYPointsRef.current
        : normalYPointsRef.current

      ctx.fillStyle = theme.shades.shade0
      ctx.fillRect(0, 0, width, height)
      drawGrid(ctx, theme.shades.shade2, width, height, 0.2)

      if (!scopeBuffer || !writeIndexBuffer || scopeBuffer.length < fftSize) {
        return
      }

      const writeIndex = Atomics.load(writeIndexBuffer, 0)
      const ringLength = scopeBuffer.length

      for (let bin = 0; bin < binCount; bin++) {
        let re = 0
        let im = 0
        const rowOffset = bin * fftSize

        for (let i = 0; i < fftSize; i++) {
          const ringIndex = (writeIndex - fftSize + i + ringLength) % ringLength
          const sample = (scopeBuffer[ringIndex] ?? 0) * (window[i] ?? 0)
          re += sample * (cosTable[rowOffset + i] ?? 0)
          im -= sample * (sinTable[rowOffset + i] ?? 0)
        }

        const magnitude = Math.sqrt(re * re + im * im) / fftSize
        const db = 20 * Math.log10(magnitude + 1e-6)
        const normalized = clamp01((db - minDb) / -minDb)
        const prev = smoothed[bin] ?? 0
        smoothed[bin] =
          normalized > prev
            ? prev + (normalized - prev) * 0.45
            : prev * 0.9 + normalized * 0.1
      }

      const baselineY = height - 1.5
      const maxHeight = height * 0.88

      for (let bin = 0; bin < binCount; bin++) {
        xPoints[bin] = (bin / Math.max(1, binCount - 1)) * width
        yPoints[bin] = baselineY - (smoothed[bin] ?? 0) * maxHeight
      }

      ctx.fillStyle = theme.accents.accent1
      ctx.globalAlpha = 0.18
      ctx.beginPath()
      ctx.moveTo(0, baselineY)
      ctx.lineTo(xPoints[0] ?? 0, yPoints[0] ?? baselineY)
      for (let i = 1; i < binCount; i++) {
        const prevX = xPoints[i - 1] ?? 0
        const prevY = yPoints[i - 1] ?? baselineY
        const currX = xPoints[i] ?? prevX
        const currY = yPoints[i] ?? prevY
        const cx = (prevX + currX) * 0.5
        const cy = (prevY + currY) * 0.5
        ctx.quadraticCurveTo(prevX, prevY, cx, cy)
      }
      const lastX = xPoints[binCount - 1] ?? width
      const lastY = yPoints[binCount - 1] ?? baselineY
      ctx.lineTo(lastX, lastY)
      ctx.lineTo(width, baselineY)
      ctx.closePath()
      ctx.fill()
      ctx.globalAlpha = 1

      ctx.strokeStyle = theme.accents.accent1
      ctx.lineWidth = 1.5
      ctx.shadowBlur = 7
      ctx.shadowColor = theme.accents.accent1
      ctx.beginPath()
      ctx.moveTo(xPoints[0] ?? 0, yPoints[0] ?? baselineY)
      for (let i = 1; i < binCount; i++) {
        const prevX = xPoints[i - 1] ?? 0
        const prevY = yPoints[i - 1] ?? baselineY
        const currX = xPoints[i] ?? prevX
        const currY = yPoints[i] ?? prevY
        const cx = (prevX + currX) * 0.5
        const cy = (prevY + currY) * 0.5
        ctx.quadraticCurveTo(prevX, prevY, cx, cy)
      }
      ctx.lineTo(lastX, lastY)
      ctx.stroke()
      ctx.shadowBlur = 0
    },
    [highKernel, highQuality, normalKernel],
  )

  if (!mod || !def) return null

  const widthPx = def.width * GRID_UNIT
  const heightPx = def.height * GRID_UNIT

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: 4,
        gap: 4,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: widthPx - 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 2px',
        }}
      >
        {qualityParam && (
          <ListSelector
            moduleId={moduleId}
            paramId='quality'
            definition={qualityParam}
            value={mod.params.quality ?? qualityParam.default}
          />
        )}
      </div>
      <CanvasZone
        width={widthPx - 10}
        height={Math.max(56, heightPx - 108)}
        render={renderSpectrum}
        scopeBuffer={scopeBuffers?.scopeBuffer ?? null}
        writeIndexBuffer={scopeBuffers?.writeIndexBuffer ?? null}
      />
    </div>
  )
}
