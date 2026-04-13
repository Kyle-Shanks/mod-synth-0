import { useMemo, useEffect, useRef } from 'react'
import { useStore } from '../../store'
import { internalWorkletId } from '../../store/subpatchSlice'
import { getModule } from '../registry'
import { Knob } from '../../components/Knob'
import { ListSelector } from '../../components/ListSelector'
import { SizedCanvas } from '../../components/SizedCanvas'
import { useTheme } from '../../theme/themeContext'
import { GRID_UNIT } from '../../theme/tokens'
import { createLogSpectrumKernel, analyzeLogSpectrum } from '../utils/logSpectrumAnalyzer'
import styles from './panel.module.css'

const VCF_N_BARS = 48
const VCF_FFT_SIZE = 4096
const VCF_SCOPE_SAMPLES = 4096
const VCF_MIN_FREQ = 20
const VCF_MAX_FREQ = 20000
const VCF_DISPLAY_SR = 44100
const VCF_AUDIO_MIN_DB = -72
const VCF_LOG_MIN_FREQ = Math.log10(VCF_MIN_FREQ)
const VCF_LOG_MAX_FREQ = Math.log10(VCF_MAX_FREQ)
const VCF_LOG_FREQ_RANGE = VCF_LOG_MAX_FREQ - VCF_LOG_MIN_FREQ

// Filter response display range:
// 0 dB (passband) maps to ~72% height, +12 dB resonance peak maps to 100%,
// giving clear headroom for peaks. Slope reaches 0 at -30 dB.
const VCF_FILT_DB_MIN = -30
const VCF_FILT_DB_MAX = 12
const VCF_FILT_DB_RANGE = VCF_FILT_DB_MAX - VCF_FILT_DB_MIN // 42
const VCF_MOD_ATTACK = 0.44
const VCF_MOD_RELEASE = 0.16

export function VCFPanel({ moduleId }: { moduleId: string }) {
  const mod = useStore((s) => s.modules[moduleId])
  const def = mod ? getModule(mod.definitionId) : undefined
  const currentInstanceId = useStore(
    (s) => s.subpatchContext[s.subpatchContext.length - 1]?.instanceId,
  )
  const engineRevision = useStore((s) => s.engineRevision)
  const setScopeBuffers = useStore((s) => s.setScopeBuffers)
  const theme = useTheme()
  const themeRef = useRef(theme)
  const paramsRef = useRef(mod?.params ?? {})
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const modTargetsRef = useRef({ cutoffNorm: Number.NaN, resNorm: Number.NaN })
  const modDisplayRef = useRef({ cutoffHz: Number.NaN, resonance: Number.NaN })

  // pre-allocated per-frame state (no heap allocation inside RAF)
  const filterResponseRef = useRef(new Float32Array(VCF_N_BARS))
  const audioMagRef = useRef(new Float32Array(VCF_N_BARS))
  const frameScratchRef = useRef(new Float32Array(VCF_FFT_SIZE))
  const fftRealScratchRef = useRef(new Float32Array(VCF_FFT_SIZE))
  const fftImagScratchRef = useRef(new Float32Array(VCF_FFT_SIZE))
  const bandPowerScratchRef = useRef(new Float32Array(VCF_N_BARS))
  const bandPeakScratchRef = useRef(new Float32Array(VCF_N_BARS))
  const bandWeightScratchRef = useRef(new Float32Array(VCF_N_BARS))
  const spectrumKernelRef = useRef<ReturnType<typeof createLogSpectrumKernel> | null>(null)
  const workletModuleId = currentInstanceId
    ? internalWorkletId(currentInstanceId, moduleId)
    : moduleId

  useEffect(() => { themeRef.current = theme }, [theme])
  useEffect(() => { paramsRef.current = mod?.params ?? {} }, [mod?.params])

  useEffect(() => {
    return useStore.subscribe((state) => {
      const cutoffNorm = state.meterValues[`${workletModuleId}:cutoffNorm`]
      const resNorm = state.meterValues[`${workletModuleId}:resNorm`]
      if (typeof cutoffNorm === 'number' && Number.isFinite(cutoffNorm)) {
        modTargetsRef.current.cutoffNorm = Math.max(0, Math.min(1, cutoffNorm))
      }
      if (typeof resNorm === 'number' && Number.isFinite(resNorm)) {
        modTargetsRef.current.resNorm = Math.max(0, Math.min(1, resNorm))
      }
    })
  }, [workletModuleId])

  useEffect(() => {
    spectrumKernelRef.current = createLogSpectrumKernel({
      fftSize: VCF_FFT_SIZE,
      nBands: VCF_N_BARS,
      sampleRate: VCF_DISPLAY_SR,
      minFreq: VCF_MIN_FREQ,
      maxFreq: VCF_MAX_FREQ,
    })
  }, [])

  const scopeBuffers = useMemo(() => {
    try {
      const sab = new SharedArrayBuffer(VCF_SCOPE_SAMPLES * Float32Array.BYTES_PER_ELEMENT)
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
      workletModuleId,
      scopeBuffers.scopeBuffer.buffer as SharedArrayBuffer,
      scopeBuffers.writeIndexBuffer.buffer as SharedArrayBuffer,
    )
  }, [workletModuleId, scopeBuffers, engineRevision, setScopeBuffers])

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const t = themeRef.current
      const p = paramsRef.current
      const w = canvas.width
      const h = canvas.height
      const spectrumKernel = spectrumKernelRef.current
      const modTargets = modTargetsRef.current
      const modDisplay = modDisplayRef.current

      ctx.fillStyle = t.shades.shade0
      ctx.fillRect(0, 0, w, h)

      const paramCutoff = Math.max(VCF_MIN_FREQ, Math.min(VCF_MAX_FREQ, p.cutoff ?? 1000))
      const paramResonance = Math.max(0, Math.min(1, p.resonance ?? 0))

      let cutoff = paramCutoff
      if (Number.isFinite(modTargets.cutoffNorm)) {
        const targetCutoff = Math.pow(
          10,
          VCF_LOG_MIN_FREQ + modTargets.cutoffNorm * VCF_LOG_FREQ_RANGE,
        )
        let displayedCutoff = modDisplay.cutoffHz
        if (!Number.isFinite(displayedCutoff)) displayedCutoff = targetCutoff
        displayedCutoff +=
          (targetCutoff - displayedCutoff)
          * (targetCutoff > displayedCutoff ? VCF_MOD_ATTACK : VCF_MOD_RELEASE)
        modDisplay.cutoffHz = displayedCutoff
        cutoff = displayedCutoff
      } else {
        modDisplay.cutoffHz = paramCutoff
      }

      let resonance = paramResonance
      if (Number.isFinite(modTargets.resNorm)) {
        const targetRes = modTargets.resNorm
        let displayedRes = modDisplay.resonance
        if (!Number.isFinite(displayedRes)) displayedRes = targetRes
        displayedRes +=
          (targetRes - displayedRes)
          * (targetRes > displayedRes ? VCF_MOD_ATTACK : VCF_MOD_RELEASE)
        modDisplay.resonance = displayedRes
        resonance = displayedRes
      } else {
        modDisplay.resonance = paramResonance
      }

      const mode = Math.round(p.mode ?? 0)

      // k from VCF process(): k = 2 - 2 * res, Q = 1/k
      const k = Math.max(0.04, 2 - 2 * Math.min(0.98, resonance))
      const Q = 1 / k

      // Compute filter frequency response at the same per-bar frequencies as the
      // shared spectrum analyzer, so the overlay and filled spectrum stay aligned.
      const filterResp = filterResponseRef.current
      for (let i = 0; i < VCF_N_BARS; i++) {
        const f =
          spectrumKernel?.frequencies[i] ??
          Math.pow(
            10,
            VCF_LOG_MIN_FREQ +
              (i / Math.max(1, VCF_N_BARS - 1)) * (VCF_LOG_MAX_FREQ - VCF_LOG_MIN_FREQ),
          )
        const ratio = f / cutoff
        const ratio2 = ratio * ratio
        const denom = Math.sqrt(
          (1 - ratio2) * (1 - ratio2) + (ratio / Q) * (ratio / Q),
        )

        let gain: number
        if (mode === 0) {
          // lowpass: 12 dB/oct rolloff above cutoff
          gain = 1 / Math.max(1e-6, denom)
        } else if (mode === 1) {
          // highpass: 12 dB/oct rolloff below cutoff
          gain = ratio2 / Math.max(1e-6, denom)
        } else {
          // bandpass: peak at cutoff, symmetric rolloff either side
          gain = (ratio / Q) / Math.max(1e-6, denom)
        }

        const db = 20 * Math.log10(Math.max(1e-4, gain))
        filterResp[i] = Math.max(0, Math.min(1, (db - VCF_FILT_DB_MIN) / VCF_FILT_DB_RANGE))
      }

      // Compute audio FFT from scope buffer output
      const sb = scopeBuffers?.scopeBuffer ?? null
      const wib = scopeBuffers?.writeIndexBuffer ?? null
      let hasAudio = false

      const audioMag = audioMagRef.current
      if (sb && wib && spectrumKernel) {
        const writeIndex = Atomics.load(wib, 0)
        hasAudio = analyzeLogSpectrum({
          scopeBuffer: sb,
          writeIndex,
          kernel: spectrumKernel,
          frameScratch: frameScratchRef.current,
          fftRealScratch: fftRealScratchRef.current,
          fftImagScratch: fftImagScratchRef.current,
          bandPowerScratch: bandPowerScratchRef.current,
          bandPeakScratch: bandPeakScratchRef.current,
          bandWeightScratch: bandWeightScratchRef.current,
          smoothedOutput: audioMag,
          minDb: VCF_AUDIO_MIN_DB,
          attack: 0.45,
          release: 0.1,
          removeDc: true,
        })
      }

      // Draw bars
      const slotW = w / VCF_N_BARS
      const barW = Math.max(1, slotW * 0.72)
      const maxH = h - 3

      for (let i = 0; i < VCF_N_BARS; i++) {
        const fResp = filterResp[i] ?? 0
        const filtH = fResp * maxH
        const x = i * slotW + (slotW - barW) * 0.5

        if (filtH < 0.5) continue

        // filter response bar: the outer container showing filter shape
        ctx.fillStyle = t.shades.shade2
        ctx.globalAlpha = 0.35
        ctx.fillRect(x, h - filtH - 1, barW, filtH)

        if (hasAudio) {
          // audio content fill: capped to filter bar height
          const audioH = Math.min((audioMag[i] ?? 0) * maxH, filtH)
          if (audioH > 0.5) {
            ctx.fillStyle = t.shades.shade3
            ctx.globalAlpha = 0.80
            ctx.fillRect(x, h - audioH - 1, barW, audioH)
          }
        } else {
          // no audio: show filter shape as solid accent fill
          ctx.fillStyle = t.accents.accent0
          ctx.globalAlpha = 0.55
          ctx.fillRect(x, h - filtH - 1, barW, filtH)
        }
      }

      ctx.globalAlpha = 1
      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [scopeBuffers])

  if (!mod || !def) return null

  const widthPx = def.width * GRID_UNIT
  const canvasW = widthPx - 16
  const paramEntries = Object.entries(def.params)

  return (
    <div className={styles.root}>
      <SizedCanvas
        ref={canvasRef}
        pixelWidth={canvasW}
        pixelHeight={80}
        className={styles.canvas}
      />
      <div className={styles.controls}>
        {paramEntries.map(([paramId, paramDef]) => {
          if (paramDef.type === 'select') {
            return (
              <ListSelector
                key={paramId}
                moduleId={moduleId}
                paramId={paramId}
                definition={paramDef}
                value={mod.params[paramId] ?? paramDef.default}
              />
            )
          }
          return (
            <Knob
              key={paramId}
              moduleId={moduleId}
              paramId={paramId}
              definition={paramDef}
              value={mod.params[paramId] ?? paramDef.default}
            />
          )
        })}
      </div>
    </div>
  )
}
