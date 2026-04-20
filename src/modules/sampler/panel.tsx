import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { useStore } from '../../store'
import { internalWorkletId } from '../../store/subpatchSlice'
import { getModule } from '../registry'
import { useTheme } from '../../theme/themeContext'
import { Knob } from '../../components/Knob'
import { ListSelector } from '../../components/ListSelector'
import { ModuleSquareButton } from '../../components/ModuleSquareButton'
import { SizedCanvas } from '../../components/SizedCanvas'
import { GRID_UNIT } from '../../theme/tokens'
import styles from './panel.module.css'

interface LoadedSample {
  name: string
  samples: Float32Array
  sampleRate: number
  durationSec: number
  peaksMin: Float32Array
  peaksMax: Float32Array
  sourceBase64: string
}

interface AudioWindowWithWebkit extends Window {
  webkitAudioContext?: typeof AudioContext
}

const PEAK_BIN_COUNT = 2048

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function buildWavePeaks(
  samples: Float32Array,
  bins: number,
): {
  min: Float32Array
  max: Float32Array
} {
  const outMin = new Float32Array(bins)
  const outMax = new Float32Array(bins)
  outMin.fill(1)
  outMax.fill(-1)

  const sampleLength = samples.length
  if (sampleLength === 0) return { min: outMin, max: outMax }

  for (let i = 0; i < bins; i++) {
    const start = Math.floor((i / bins) * sampleLength)
    const end = Math.max(start + 1, Math.floor(((i + 1) / bins) * sampleLength))
    let minValue = 1
    let maxValue = -1
    for (let s = start; s < end; s++) {
      const value = samples[s] ?? 0
      if (value < minValue) minValue = value
      if (value > maxValue) maxValue = value
    }
    outMin[i] = minValue
    outMax[i] = maxValue
  }

  return { min: outMin, max: outMax }
}

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  peaksMin: Float32Array,
  peaksMax: Float32Array,
) {
  if (width <= 0 || height <= 0) return
  const bins = peaksMin.length
  if (bins === 0) return

  ctx.beginPath()
  for (let x = 0; x < width; x++) {
    const t = x / Math.max(1, width - 1)
    const bin = Math.min(bins - 1, Math.floor(t * bins))
    const min = peaksMin[bin] ?? 0
    const max = peaksMax[bin] ?? 0
    const yTop = clamp((1 - max) * 0.5 * height, 0, height)
    const yBottom = clamp((1 - min) * 0.5 * height, 0, height)
    ctx.moveTo(x + 0.5, yTop)
    ctx.lineTo(x + 0.5, yBottom)
  }
  ctx.stroke()
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0.00s'
  if (seconds < 60) return `${seconds.toFixed(2)}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds - mins * 60
  return `${mins}:${secs.toFixed(2).padStart(5, '0')}`
}

function float32ToBase64(samples: Float32Array): string {
  const bytes = new Uint8Array(
    samples.buffer,
    samples.byteOffset,
    samples.byteLength,
  )
  const chunkSize = 0x8000
  const binaryParts: string[] = []
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const end = Math.min(bytes.length, i + chunkSize)
    let chunk = ''
    for (let j = i; j < end; j++) {
      chunk += String.fromCharCode(bytes[j] ?? 0)
    }
    binaryParts.push(chunk)
  }
  return btoa(binaryParts.join(''))
}

function base64ToFloat32(base64: string): Float32Array {
  if (!base64) return new Float32Array(0)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i) & 0xff
  }
  if (bytes.length % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error('invalid sample data')
  }
  return new Float32Array(bytes.buffer.slice(0))
}

export function SamplerPanel({ moduleId }: { moduleId: string }) {
  const mod = useStore((s) => s.modules[moduleId])
  const def = mod ? getModule(mod.definitionId) : undefined
  const theme = useTheme()
  const setParam = useStore((s) => s.setParam)
  const setModuleDataValue = useStore((s) => s.setModuleDataValue)
  const currentInstanceId = useStore(
    (s) => s.subpatchContext[s.subpatchContext.length - 1]?.instanceId,
  )
  const engineRevision = useStore((s) => s.engineRevision)
  const setSamplerBuffer = useStore((s) => s.setSamplerBuffer)
  const setSamplerPlayheadBuffer = useStore((s) => s.setSamplerPlayheadBuffer)
  const triggerSampler = useStore((s) => s.triggerSampler)
  const stopSampler = useStore((s) => s.stopSampler)

  const workletModuleId = currentInstanceId
    ? internalWorkletId(currentInstanceId, moduleId)
    : moduleId

  const themeRef = useRef(theme)
  const paramsRef = useRef(mod?.params ?? {})
  const loadedSampleRef = useRef<LoadedSample | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [sampleVersion, setSampleVersion] = useState(0)
  const [hasSampleLoaded, setHasSampleLoaded] = useState(false)
  const [sampleName, setSampleName] = useState('no sample loaded')
  const [sampleDurationSec, setSampleDurationSec] = useState(0)
  const [errorText, setErrorText] = useState<string | null>(null)

  const persistedSampleData = mod?.data?.sampleData ?? ''
  const persistedSampleRateRaw = mod?.data?.sampleRate ?? ''
  const persistedSampleName = mod?.data?.sampleName ?? ''

  useEffect(() => {
    themeRef.current = theme
  }, [theme])

  useEffect(() => {
    paramsRef.current = mod?.params ?? {}
  }, [mod?.params])

  const showEmptyUi = useCallback(() => {
    setHasSampleLoaded(false)
    setSampleName('no sample loaded')
    setSampleDurationSec(0)
    setErrorText(null)
  }, [])

  const showLoadedUi = useCallback(
    (name: string, durationSec: number, hasSample: boolean) => {
      setHasSampleLoaded(hasSample)
      setSampleName(name)
      setSampleDurationSec(durationSec)
      setErrorText(null)
    },
    [],
  )

  const showErrorUi = useCallback((message: string) => {
    setHasSampleLoaded(false)
    setSampleName('no sample loaded')
    setSampleDurationSec(0)
    setErrorText(message)
  }, [])

  const scheduleUiUpdate = useCallback((task: () => void) => {
    queueMicrotask(task)
  }, [])

  const playheadBuffer = useMemo(() => {
    try {
      return new Int32Array(
        new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2),
      )
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    if (!playheadBuffer) return
    setSamplerPlayheadBuffer(
      workletModuleId,
      playheadBuffer.buffer as SharedArrayBuffer,
    )
  }, [
    workletModuleId,
    playheadBuffer,
    engineRevision,
    setSamplerPlayheadBuffer,
  ])

  useEffect(() => {
    const sample = loadedSampleRef.current
    if (!sample || sample.samples.length <= 1) {
      setSamplerBuffer(workletModuleId, new Float32Array(0).buffer, 44100)
      return
    }
    setSamplerBuffer(
      workletModuleId,
      sample.samples.slice().buffer,
      sample.sampleRate,
    )
  }, [workletModuleId, sampleVersion, engineRevision, setSamplerBuffer])

  useEffect(() => {
    if (!persistedSampleData) {
      const loaded = loadedSampleRef.current
      if (loaded && loaded.sourceBase64) {
        loadedSampleRef.current = null
        scheduleUiUpdate(() => {
          showEmptyUi()
          setSampleVersion((v) => v + 1)
        })
      }
      return
    }

    const persistedSampleRate = Number(persistedSampleRateRaw)
    if (!Number.isFinite(persistedSampleRate) || persistedSampleRate <= 0) {
      loadedSampleRef.current = null
      scheduleUiUpdate(() => {
        showErrorUi('invalid saved sample rate')
        setSampleVersion((v) => v + 1)
      })
      return
    }

    const loaded = loadedSampleRef.current
    if (
      loaded &&
      loaded.sourceBase64 === persistedSampleData &&
      loaded.sampleRate === persistedSampleRate
    ) {
      return
    }

    try {
      const samples = base64ToFloat32(persistedSampleData)
      const peaks = buildWavePeaks(samples, PEAK_BIN_COUNT)
      const durationSec = samples.length / persistedSampleRate
      loadedSampleRef.current = {
        name: persistedSampleName || 'loaded sample',
        samples,
        sampleRate: persistedSampleRate,
        durationSec,
        peaksMin: peaks.min,
        peaksMax: peaks.max,
        sourceBase64: persistedSampleData,
      }
      scheduleUiUpdate(() => {
        showLoadedUi(
          persistedSampleName || 'loaded sample',
          durationSec,
          samples.length > 1,
        )
        setSampleVersion((v) => v + 1)
      })
    } catch {
      loadedSampleRef.current = null
      scheduleUiUpdate(() => {
        showErrorUi('failed to restore sample')
        setSampleVersion((v) => v + 1)
      })
    }
  }, [
    persistedSampleData,
    persistedSampleRateRaw,
    persistedSampleName,
    scheduleUiUpdate,
    showEmptyUi,
    showErrorUi,
    showLoadedUi,
  ])

  const getAudioContext = useCallback((): AudioContext | null => {
    if (audioCtxRef.current) return audioCtxRef.current
    const ctor =
      window.AudioContext ??
      (window as AudioWindowWithWebkit).webkitAudioContext
    if (!ctor) return null
    audioCtxRef.current = new ctor()
    return audioCtxRef.current
  }, [])

  const decodeFileToSample = useCallback(
    async (file: File): Promise<LoadedSample | null> => {
      const ctx = getAudioContext()
      if (!ctx) return null
      const arrayBuffer = await file.arrayBuffer()
      const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0))

      const channels = Math.max(1, decoded.numberOfChannels)
      const mono = new Float32Array(decoded.length)
      for (let c = 0; c < channels; c++) {
        const channelData = decoded.getChannelData(c)
        for (let i = 0; i < mono.length; i++) {
          mono[i] = (mono[i] ?? 0) + (channelData[i] ?? 0) / channels
        }
      }

      const sourceBase64 = float32ToBase64(mono)
      const peaks = buildWavePeaks(mono, PEAK_BIN_COUNT)
      return {
        name: file.name.toLowerCase(),
        samples: mono,
        sampleRate: decoded.sampleRate,
        durationSec: decoded.duration,
        peaksMin: peaks.min,
        peaksMax: peaks.max,
        sourceBase64,
      }
    },
    [getAudioContext],
  )

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return

      setErrorText(null)
      try {
        const sample = await decodeFileToSample(file)
        if (!sample) {
          setErrorText('audio decode unavailable')
          return
        }
        loadedSampleRef.current = sample
        setHasSampleLoaded(true)
        setSampleName(sample.name)
        setSampleDurationSec(sample.durationSec)
        setSampleVersion((v) => v + 1)
        setModuleDataValue(moduleId, 'sampleData', sample.sourceBase64)
        setModuleDataValue(moduleId, 'sampleRate', String(sample.sampleRate))
        setModuleDataValue(moduleId, 'sampleName', sample.name)
      } catch {
        setErrorText('failed to load sample')
      }
    },
    [decodeFileToSample, moduleId, setModuleDataValue],
  )

  const handleLoadClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      fileInputRef.current?.click()
    },
    [],
  )

  const handleClearClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      stopSampler(workletModuleId)
      loadedSampleRef.current = null
      showEmptyUi()
      setSampleVersion((v) => v + 1)
      setModuleDataValue(moduleId, 'sampleData', '')
      setModuleDataValue(moduleId, 'sampleRate', '')
      setModuleDataValue(moduleId, 'sampleName', '')
    },
    [moduleId, setModuleDataValue, showEmptyUi, stopSampler, workletModuleId],
  )

  const handlePlayClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      triggerSampler(workletModuleId)
    },
    [triggerSampler, workletModuleId],
  )

  const handleStopClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      stopSampler(workletModuleId)
    },
    [stopSampler, workletModuleId],
  )

  const loopEnabled = (mod?.params.loop ?? 0) >= 0.5
  const reverseEnabled = (mod?.params.reverse ?? 0) >= 0.5

  const handleLoopToggle = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      useStore.getState().stageHistory()
      setParam(moduleId, 'loop', loopEnabled ? 0 : 1)
      useStore.getState().commitHistory()
    },
    [moduleId, loopEnabled, setParam],
  )

  const handleReverseToggle = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      useStore.getState().stageHistory()
      setParam(moduleId, 'reverse', reverseEnabled ? 0 : 1)
      useStore.getState().commitHistory()
    },
    [moduleId, reverseEnabled, setParam],
  )

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const w = canvas.width
      const h = canvas.height
      const t = themeRef.current
      const p = paramsRef.current
      const loaded = loadedSampleRef.current

      ctx.fillStyle = t.shades.shade0
      ctx.fillRect(0, 0, w, h)

      ctx.strokeStyle = t.shades.shade2
      ctx.globalAlpha = 0.35
      ctx.beginPath()
      ctx.moveTo(0, h * 0.5 + 0.5)
      ctx.lineTo(w, h * 0.5 + 0.5)
      ctx.stroke()
      ctx.globalAlpha = 1

      if (!loaded) {
        ctx.fillStyle = t.shades.shade3
        ctx.globalAlpha = 0.55
        ctx.font = `${Math.max(9, Math.floor(h * 0.18))}px var(--font)`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('load sample', w * 0.5, h * 0.5)
        ctx.globalAlpha = 1
        rafRef.current = requestAnimationFrame(draw)
        return
      }

      const startNorm = clamp(p.start ?? 0, 0, 0.999)
      const endNorm = clamp(p.end ?? 1, 0.001, 1)
      const selectionStart = Math.min(startNorm, endNorm - 0.001)
      const selectionEnd = Math.max(endNorm, selectionStart + 0.001)
      const startX = Math.floor(selectionStart * w)
      const endX = Math.max(startX + 1, Math.floor(selectionEnd * w))

      ctx.fillStyle = t.accents.accent0
      ctx.globalAlpha = 0.12
      ctx.fillRect(startX, 0, Math.max(1, endX - startX), h)
      ctx.globalAlpha = 1

      ctx.strokeStyle = t.shades.shade2
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.72
      drawWaveform(ctx, w, h, loaded.peaksMin, loaded.peaksMax)
      ctx.globalAlpha = 1

      ctx.save()
      ctx.beginPath()
      ctx.rect(startX, 0, Math.max(1, endX - startX), h)
      ctx.clip()
      ctx.strokeStyle = t.accents.accent1
      ctx.lineWidth = 1.1
      drawWaveform(ctx, w, h, loaded.peaksMin, loaded.peaksMax)
      ctx.restore()

      ctx.strokeStyle = t.accents.accent0
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.8
      ctx.beginPath()
      ctx.moveTo(startX + 0.5, 0)
      ctx.lineTo(startX + 0.5, h)
      ctx.moveTo(endX + 0.5, 0)
      ctx.lineTo(endX + 0.5, h)
      ctx.stroke()
      ctx.globalAlpha = 1

      let playheadIndex = 0
      let isPlaying = false
      if (playheadBuffer) {
        playheadIndex = Atomics.load(playheadBuffer, 0)
        isPlaying = Atomics.load(playheadBuffer, 1) === 1
      }
      const sampleLength = loaded.samples.length
      const playheadX =
        sampleLength > 1
          ? clamp((playheadIndex / (sampleLength - 1)) * (w - 1), 0, w - 1)
          : 0
      ctx.strokeStyle = isPlaying ? t.accents.accent3 : t.shades.shade3
      ctx.lineWidth = 1.5
      ctx.globalAlpha = isPlaying ? 0.95 : 0.45
      ctx.beginPath()
      ctx.moveTo(playheadX + 0.5, 0)
      ctx.lineTo(playheadX + 0.5, h)
      ctx.stroke()
      ctx.globalAlpha = 1

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playheadBuffer])

  useEffect(() => {
    return () => {
      audioCtxRef.current?.close().catch(() => {})
      audioCtxRef.current = null
    }
  }, [])

  if (!mod || !def) return null

  const widthPx = def.width * GRID_UNIT
  const knobIds = ['start', 'end', 'rate', 'level'] as const
  const modeDef = def.params.mode

  return (
    <div className={styles.root}>
      <input
        ref={fileInputRef}
        type='file'
        accept='audio/*,.wav,.aiff,.aif,.mp3,.ogg,.flac,.m4a'
        className={styles.hiddenInput}
        onChange={handleFileChange}
        onMouseDown={(e) => e.stopPropagation()}
      />

      <div className={styles.topRow}>
        <button
          type='button'
          className={styles.actionButton}
          onClick={handleLoadClick}
          onMouseDown={(e) => e.stopPropagation()}
        >
          load
        </button>
        <button
          type='button'
          className={styles.actionButton}
          onClick={handlePlayClick}
          onMouseDown={(e) => e.stopPropagation()}
          disabled={!hasSampleLoaded}
        >
          play
        </button>
        <button
          type='button'
          className={styles.actionButton}
          onClick={handleStopClick}
          onMouseDown={(e) => e.stopPropagation()}
          disabled={!hasSampleLoaded}
        >
          stop
        </button>
        <button
          type='button'
          className={styles.actionButton}
          onClick={handleClearClick}
          onMouseDown={(e) => e.stopPropagation()}
          disabled={!hasSampleLoaded}
        >
          clear
        </button>
      </div>

      <div className={styles.metaRow}>
        <div className={styles.metaName} title={sampleName}>
          {sampleName}
        </div>
        <div className={styles.metaDuration}>
          {formatDuration(sampleDurationSec)}
        </div>
      </div>
      {errorText ? <div className={styles.errorText}>{errorText}</div> : null}

      <SizedCanvas
        ref={canvasRef}
        pixelWidth={widthPx - 16}
        pixelHeight={86}
        className={styles.waveCanvas}
      />

      <div className={styles.modeRow}>
        {modeDef ? (
          <div className={styles.modeSelect}>
            <ListSelector
              moduleId={moduleId}
              paramId='mode'
              definition={modeDef}
              value={mod.params.mode ?? modeDef.default}
            />
          </div>
        ) : null}
        <div className={styles.toggleGroup}>
          <div className={styles.toggleControl}>
            <ModuleSquareButton
              pressed={loopEnabled}
              ariaLabel='loop'
              onPointerDown={handleLoopToggle}
            />
            <div className={styles.toggleLabel}>loop</div>
          </div>
          <div className={styles.toggleControl}>
            <ModuleSquareButton
              pressed={reverseEnabled}
              ariaLabel='reverse'
              onPointerDown={handleReverseToggle}
            />
            <div className={styles.toggleLabel}>reverse</div>
          </div>
        </div>
      </div>

      <div className={styles.controlsRow}>
        {knobIds.map((paramId) => {
          const paramDef = def.params[paramId]
          if (!paramDef) return null
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
