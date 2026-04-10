import { useEffect, useMemo, useRef } from 'react'
import { useStore } from '../../store'
import { internalWorkletId } from '../../store/subpatchSlice'
import { getModule } from '../registry'
import { Knob } from '../../components/Knob'
import { SizedCanvas } from '../../components/SizedCanvas'
import { GRID_UNIT } from '../../theme/tokens'
import { useTheme } from '../../theme/themeContext'
import { createWavetableBanks } from './wavetables'
import styles from './panel.module.css'

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

const WAVE_POS_ATTACK = 0.42
const WAVE_POS_RELEASE = 0.22

export function WavetableVCOPanel({ moduleId }: { moduleId: string }) {
  const mod = useStore((s) => s.modules[moduleId])
  const def = mod ? getModule(mod.definitionId) : undefined
  const setParam = useStore((s) => s.setParam)
  const theme = useTheme()
  const themeRef = useRef(theme)
  const paramsRef = useRef(mod?.params ?? {})
  const bankIndexRef = useRef(0)
  const wavePosTargetRef = useRef(Number.NaN)
  const wavePosDisplayRef = useRef(Number.NaN)
  const rafRef = useRef(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const previewTableSize = 1024
  const previewBanks = useMemo(
    () => createWavetableBanks(previewTableSize),
    [],
  )

  const bankDef = def?.params.bank
  const bankOptions =
    bankDef && bankDef.type === 'select'
      ? (bankDef.options ?? [])
      : []

  const bankCount = Math.max(1, bankOptions.length)
  const bankParam = mod?.params.bank ?? bankDef?.default ?? 0
  const bankIndex = clamp(Math.round(bankParam), 0, bankCount - 1)
  const bankName = bankOptions[bankIndex] ?? `bank ${bankIndex + 1}`
  const widthPx = def ? def.width * GRID_UNIT : 192
  const canvasW = widthPx - 16

  useEffect(() => { themeRef.current = theme }, [theme])
  useEffect(() => { paramsRef.current = mod?.params ?? {} }, [mod?.params])
  useEffect(() => { bankIndexRef.current = bankIndex }, [bankIndex])

  useEffect(() => {
    return useStore.subscribe((state) => {
      const ctx = state.subpatchContext
      const instanceId = ctx[ctx.length - 1]?.instanceId
      const workletId = instanceId
        ? internalWorkletId(instanceId, moduleId)
        : moduleId
      const wavePosNorm = state.meterValues[`${workletId}:wavePosNorm`]
      if (typeof wavePosNorm === 'number' && Number.isFinite(wavePosNorm)) {
        wavePosTargetRef.current = Math.max(0, Math.min(1, wavePosNorm))
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

      ctx.fillStyle = t.shades.shade0
      ctx.fillRect(0, 0, w, h)

      ctx.strokeStyle = t.shades.shade2
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, h / 2)
      ctx.lineTo(w, h / 2)
      ctx.stroke()

      const tables =
        previewBanks[Math.max(0, Math.min(previewBanks.length - 1, bankIndexRef.current))]
        ?? previewBanks[0]
      if (!tables) {
        rafRef.current = requestAnimationFrame(draw)
        return
      }

      const tableCount = tables.length
      const maxPosition = tableCount - 1
      let pos = clamp(p.position ?? 1, 0, maxPosition)
      const wavePosTargetNorm = wavePosTargetRef.current

      if (Number.isFinite(wavePosTargetNorm)) {
        const targetPos = wavePosTargetNorm * maxPosition
        let displayPos = wavePosDisplayRef.current
        if (!Number.isFinite(displayPos)) displayPos = targetPos
        displayPos +=
          (targetPos - displayPos)
          * (targetPos > displayPos ? WAVE_POS_ATTACK : WAVE_POS_RELEASE)
        wavePosDisplayRef.current = displayPos
        pos = clamp(displayPos, 0, maxPosition)
      } else {
        wavePosDisplayRef.current = pos
      }

      const tableAIndex = Math.floor(pos)
      const tableBIndex = Math.min(maxPosition, tableAIndex + 1)
      const tableMix = pos - tableAIndex
      const tableA = (tables[tableAIndex] ?? tables[0]) as Float32Array | undefined
      if (!tableA) {
        rafRef.current = requestAnimationFrame(draw)
        return
      }
      const tableB = (tables[tableBIndex] ?? tableA) as Float32Array
      const tableSize = tableA.length
      const twoPi = 2 * Math.PI
      const warpAmt = clamp(p.warp ?? 0.25, 0, 1)
      const warpDepth = warpAmt * 0.3
      const cycleMult = Math.max(1, p.mult ?? 1)

      ctx.strokeStyle = t.accents.accent0
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (let px = 0; px < w; px++) {
        const phase = px / Math.max(1, w - 1)
        const phaseWarped =
          phase * cycleMult +
          Math.sin(phase * twoPi * cycleMult) * warpDepth
        const wrappedPhase = phaseWarped - Math.floor(phaseWarped)
        const tablePhase = wrappedPhase * tableSize
        const readIndex = Math.floor(tablePhase)
        const readNext = (readIndex + 1) % tableSize
        const frac = tablePhase - readIndex

        const sampleA =
          (tableA[readIndex] ?? 0) * (1 - frac) + (tableA[readNext] ?? 0) * frac
        const sampleB =
          (tableB[readIndex] ?? 0) * (1 - frac) + (tableB[readNext] ?? 0) * frac
        const sample = sampleA + (sampleB - sampleA) * tableMix
        const py = h / 2 - sample * (h * 0.42)

        if (px === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [previewBanks])

  if (!mod || !def) return null

  function cycleBank(delta: number): void {
    if (bankOptions.length <= 1) return
    const next = (bankIndex + delta + bankOptions.length) % bankOptions.length
    useStore.getState().stageHistory()
    setParam(moduleId, 'bank', next)
    useStore.getState().commitHistory()
  }

  const knobEntries = Object.entries(def.params).filter(
    ([paramId, paramDef]) => paramId !== 'bank' && paramDef.type !== 'select',
  )

  return (
    <div className={styles.root}>
      <div className={styles.bankRow}>
        <button
          type='button'
          className={styles.bankButton}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            cycleBank(-1)
          }}
          aria-label='previous wavetable bank'
        >
          {'<'}
        </button>
        <div className={styles.bankLabel}>
          {bankName}
        </div>
        <button
          type='button'
          className={styles.bankButton}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            cycleBank(1)
          }}
          aria-label='next wavetable bank'
        >
          {'>'}
        </button>
      </div>

      <SizedCanvas
        ref={canvasRef}
        pixelWidth={canvasW}
        pixelHeight={58}
        className={styles.canvas}
      />

      <div className={styles.knobsRow}>
        {knobEntries.map(([paramId, paramDef]) => (
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
