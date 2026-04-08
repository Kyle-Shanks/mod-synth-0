import { useMemo, useEffect, useCallback, useRef } from 'react'
import { useStore } from '../../store'
import { getModule } from '../registry'
import { CanvasZone } from '../../components/CanvasZone'
import type { CanvasData } from '../../components/CanvasZone'
import { GRID_UNIT } from '../../theme/tokens'
import { createLogSpectrumKernel, analyzeLogSpectrum } from '../utils/logSpectrumAnalyzer'

interface SpectrumPanelProps {
  moduleId: string
}

const FFT_SIZE = 4096
const N_DISPLAY_BARS = 56
const MIN_DB = -90
const MIN_FREQ = 20
const MAX_FREQ = 20000
const SAMPLE_RATE = 44100
const ATTACK = 0.45
const RELEASE = 0.1

export function SpectrumPanel({ moduleId }: SpectrumPanelProps) {
  const mod = useStore((s) => s.modules[moduleId])
  const def = mod ? getModule(mod.definitionId) : undefined
  const engineRevision = useStore((s) => s.engineRevision)
  const setScopeBuffers = useStore((s) => s.setScopeBuffers)

  const kernel = useMemo(
    () =>
      createLogSpectrumKernel({
        fftSize: FFT_SIZE,
        nBands: N_DISPLAY_BARS,
        sampleRate: SAMPLE_RATE,
        minFreq: MIN_FREQ,
        maxFreq: MAX_FREQ,
      }),
    [],
  )
  const smoothedRef = useRef(new Float32Array(N_DISPLAY_BARS))
  const frameScratchRef = useRef(new Float32Array(FFT_SIZE))
  const fftRealScratchRef = useRef(new Float32Array(FFT_SIZE))
  const fftImagScratchRef = useRef(new Float32Array(FFT_SIZE))
  const bandPowerScratchRef = useRef(new Float32Array(N_DISPLAY_BARS))
  const bandPeakScratchRef = useRef(new Float32Array(N_DISPLAY_BARS))
  const bandWeightScratchRef = useRef(new Float32Array(N_DISPLAY_BARS))

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

  const renderSpectrum = useCallback(
    (ctx: CanvasRenderingContext2D, data: CanvasData) => {
      const { width, height, theme, scopeBuffer, writeIndexBuffer } = data
      const smoothed = smoothedRef.current

      ctx.fillStyle = theme.shades.shade0
      ctx.fillRect(0, 0, width, height)

      const slotW = width / N_DISPLAY_BARS
      const barW = Math.max(1, slotW * 0.72)
      const maxBarH = height - 4

      if (!scopeBuffer || !writeIndexBuffer || scopeBuffer.length < FFT_SIZE) {
        // no audio: empty containers
        ctx.fillStyle = theme.shades.shade2
        ctx.globalAlpha = 0.18
        for (let i = 0; i < N_DISPLAY_BARS; i++) {
          const x = i * slotW + (slotW - barW) * 0.5
          ctx.fillRect(x, 4, barW, maxBarH)
        }
        ctx.globalAlpha = 1
        return
      }

      const writeIndex = Atomics.load(writeIndexBuffer, 0)
      analyzeLogSpectrum({
        scopeBuffer,
        writeIndex,
        kernel,
        frameScratch: frameScratchRef.current,
        fftRealScratch: fftRealScratchRef.current,
        fftImagScratch: fftImagScratchRef.current,
        bandPowerScratch: bandPowerScratchRef.current,
        bandPeakScratch: bandPeakScratchRef.current,
        bandWeightScratch: bandWeightScratchRef.current,
        smoothedOutput: smoothed,
        minDb: MIN_DB,
        attack: ATTACK,
        release: RELEASE,
        removeDc: true,
      })

      for (let i = 0; i < N_DISPLAY_BARS; i++) {
        const magnitude = smoothed[i] ?? 0
        const x = i * slotW + (slotW - barW) * 0.5

        // full-height container
        ctx.fillStyle = theme.shades.shade2
        ctx.globalAlpha = 0.18
        ctx.fillRect(x, 4, barW, maxBarH)

        // frequency fill from bottom
        const fillH = magnitude * maxBarH
        if (fillH > 0.5) {
          ctx.fillStyle = theme.accents.accent1
          ctx.globalAlpha = 0.82
          ctx.fillRect(x, 4 + maxBarH - fillH, barW, fillH)
        }
      }

      ctx.globalAlpha = 1
    },
    [kernel],
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
      <CanvasZone
        width={widthPx - 10}
        height={Math.max(56, heightPx - 72)}
        render={renderSpectrum}
        scopeBuffer={scopeBuffers?.scopeBuffer ?? null}
        writeIndexBuffer={scopeBuffers?.writeIndexBuffer ?? null}
      />
    </div>
  )
}
