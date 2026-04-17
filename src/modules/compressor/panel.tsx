import { useRef, useEffect } from 'react'
import { useStore } from '../../store'
import { internalWorkletId } from '../../store/subpatchSlice'
import { getModule } from '../registry'
import { useTheme } from '../../theme/themeContext'
import { Knob } from '../../components/Knob'
import { SizedCanvas } from '../../components/SizedCanvas'
import { GRID_UNIT } from '../../theme/tokens'
import styles from './panel.module.css'

const METER_DB_FLOOR = -60
const METER_DB_CEIL = 0
const METER_DB_RANGE = METER_DB_CEIL - METER_DB_FLOOR
const INPUT_ATTACK = 0.46
const INPUT_RELEASE = 0.22
const GR_ATTACK = 0.48
const GR_RELEASE = 0.14
const MIN_GR_LINEAR = 1e-4

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function clamp01(v: number): number {
  return clamp(v, 0, 1)
}

function dbToNorm(db: number): number {
  return clamp01((db - METER_DB_FLOOR) / METER_DB_RANGE)
}

function normToDb(norm: number): number {
  return METER_DB_FLOOR + clamp01(norm) * METER_DB_RANGE
}

function normToY(norm: number, height: number): number {
  return height - 1 - clamp01(norm) * Math.max(1, height - 2)
}

export function CompressorPanel({ moduleId }: { moduleId: string }) {
  const mod = useStore((s) => s.modules[moduleId])
  const def = mod ? getModule(mod.definitionId) : undefined
  const theme = useTheme()
  const themeRef = useRef(theme)
  const paramsRef = useRef(mod?.params ?? {})
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const inputTargetRef = useRef(0)
  const inputDisplayRef = useRef(0)
  const grTargetRef = useRef(1)
  const grDisplayRef = useRef(1)
  const inputHistoryRef = useRef<Float32Array | null>(null)
  const reducedHistoryRef = useRef<Float32Array | null>(null)
  const historyWidthRef = useRef(0)

  useEffect(() => { themeRef.current = theme }, [theme])
  useEffect(() => { paramsRef.current = mod?.params ?? {} }, [mod?.params])

  const widthPx = def ? def.width * GRID_UNIT : 240

  useEffect(() => {
    return useStore.subscribe((state) => {
      const ctx = state.subpatchContext
      const instanceId = ctx[ctx.length - 1]?.instanceId
      const workletId = instanceId
        ? internalWorkletId(instanceId, moduleId)
        : moduleId
      const inputNorm = state.meterValues[`${workletId}:inDbNorm`]
      if (typeof inputNorm === 'number' && Number.isFinite(inputNorm)) {
        inputTargetRef.current = clamp01(inputNorm)
      }

      const gr = state.meterValues[`${workletId}:gr`]
      if (typeof gr === 'number' && Number.isFinite(gr)) {
        grTargetRef.current = clamp(gr, 0, 1)
      }
    })
  }, [moduleId])

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
      if (w < 2 || h < 2) {
        rafRef.current = requestAnimationFrame(draw)
        return
      }

      let inputDisplay = inputDisplayRef.current
      const inputTarget = inputTargetRef.current
      inputDisplay +=
        (inputTarget - inputDisplay)
        * (inputTarget > inputDisplay ? INPUT_ATTACK : INPUT_RELEASE)
      inputDisplayRef.current = inputDisplay

      let grDisplay = grDisplayRef.current
      const grTarget = grTargetRef.current
      grDisplay +=
        (grTarget - grDisplay) * (grTarget < grDisplay ? GR_ATTACK : GR_RELEASE)
      grDisplayRef.current = grDisplay

      const inputDb = normToDb(inputDisplay)
      const gainReductionDb = Math.max(
        0,
        -20 * Math.log10(Math.max(MIN_GR_LINEAR, grDisplay)),
      )
      const reducedDb = Math.max(METER_DB_FLOOR, inputDb - gainReductionDb)
      const reducedNorm = dbToNorm(reducedDb)

      if (
        historyWidthRef.current !== w
        || !inputHistoryRef.current
        || !reducedHistoryRef.current
      ) {
        historyWidthRef.current = w
        inputHistoryRef.current = new Float32Array(w)
        reducedHistoryRef.current = new Float32Array(w)
        inputHistoryRef.current.fill(inputDisplay)
        reducedHistoryRef.current.fill(reducedNorm)
      }

      const inputHistory = inputHistoryRef.current
      const reducedHistory = reducedHistoryRef.current
      if (!inputHistory || !reducedHistory) return

      if (w > 1) {
        inputHistory.copyWithin(0, 1)
        reducedHistory.copyWithin(0, 1)
      }
      inputHistory[w - 1] = inputDisplay
      reducedHistory[w - 1] = reducedNorm

      ctx.fillStyle = t.shades.shade0
      ctx.fillRect(0, 0, w, h)

      // horizontal guides
      ctx.strokeStyle = t.shades.shade2
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.22
      for (let i = 1; i < 4; i++) {
        const y = (i / 4) * h
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // threshold line
      const threshold = clamp(p.threshold ?? -12, METER_DB_FLOOR, METER_DB_CEIL)
      const threshY = normToY(dbToNorm(threshold), h)
      ctx.strokeStyle = t.accents.accent3
      ctx.lineWidth = 1.5
      ctx.globalAlpha = 0.95
      ctx.beginPath()
      ctx.moveTo(0, threshY)
      ctx.lineTo(w, threshY)
      ctx.stroke()
      ctx.globalAlpha = 1

      // input filled trace
      ctx.beginPath()
      ctx.moveTo(0, h - 1)
      for (let x = 0; x < w; x++) {
        ctx.lineTo(x, normToY(inputHistory[x] ?? 0, h))
      }
      ctx.lineTo(w - 1, h - 1)
      ctx.closePath()
      ctx.fillStyle = t.accents.accent0
      ctx.globalAlpha = 0.18
      ctx.fill()
      ctx.globalAlpha = 1

      // highlight gain reduction delta
      ctx.beginPath()
      for (let x = 0; x < w; x++) {
        const y = normToY(inputHistory[x] ?? 0, h)
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      for (let x = w - 1; x >= 0; x--) {
        ctx.lineTo(x, normToY(reducedHistory[x] ?? 0, h))
      }
      ctx.closePath()
      ctx.fillStyle = t.accents.accent2
      ctx.globalAlpha = 0.28
      ctx.fill()
      ctx.globalAlpha = 1

      // reduced level trace
      ctx.strokeStyle = t.accents.accent2
      ctx.lineWidth = 1.8
      ctx.beginPath()
      for (let x = 0; x < w; x++) {
        const y = normToY(reducedHistory[x] ?? 0, h)
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()

      // input level trace
      ctx.strokeStyle = t.accents.accent0
      ctx.lineWidth = 1.3
      ctx.beginPath()
      for (let x = 0; x < w; x++) {
        const y = normToY(inputHistory[x] ?? 0, h)
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()

      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  if (!mod || !def) return null

  const canvasW = widthPx - 16
  const paramEntries = Object.entries(def.params)

  return (
    <div className={styles.root}>
      <SizedCanvas
        ref={canvasRef}
        pixelWidth={canvasW}
        pixelHeight={96}
        className={styles.displayCanvas}
      />

      <div className={styles.knobsRow}>
        {paramEntries.map(([paramId, paramDef]) => (
          <Knob
            key={paramId}
            moduleId={moduleId}
            paramId={paramId}
            definition={paramDef}
            value={mod.params[paramId] ?? paramDef.default}
          />
        ))}
      </div>
    </div>
  )
}
