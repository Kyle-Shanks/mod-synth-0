import { useRef, useEffect } from 'react'
import { useStore } from '../../store'
import { getModule } from '../registry'
import { useTheme } from '../../theme/themeContext'
import { Knob } from '../../components/Knob'
import { GRID_UNIT } from '../../theme/tokens'

export function CompressorPanel({ moduleId }: { moduleId: string }) {
  const mod = useStore((s) => s.modules[moduleId])
  const def = mod ? getModule(mod.definitionId) : undefined
  const grLevel = useStore((s) => s.meterValues[`${moduleId}:gr`] ?? 1)
  const theme = useTheme()
  const themeRef = useRef(theme)
  const paramsRef = useRef(mod?.params ?? {})
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => { themeRef.current = theme }, [theme])
  useEffect(() => { paramsRef.current = mod?.params ?? {} }, [mod?.params])

  const widthPx = def ? def.width * GRID_UNIT : 240

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

      const threshold = p.threshold ?? -12
      const ratio = Math.max(1.001, p.ratio ?? 4)
      const knee = p.knee ?? 6
      const makeup = p.makeup ?? 0
      const rangeDb = 60
      const halfKnee = knee / 2

      // grid
      ctx.strokeStyle = t.shades.shade2
      ctx.lineWidth = 0.5
      ctx.globalAlpha = 0.25
      const gridStep = w / 6
      for (let x = 0; x <= w; x += gridStep) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, (x / w) * h); ctx.lineTo(w, (x / w) * h); ctx.stroke()
      }
      ctx.globalAlpha = 1

      // 1:1 unity line
      ctx.strokeStyle = t.shades.shade2
      ctx.lineWidth = 1
      ctx.setLineDash([3, 4])
      ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w, 0); ctx.stroke()
      ctx.setLineDash([])

      // threshold line
      const threshX = ((threshold + rangeDb) / rangeDb) * w
      ctx.strokeStyle = t.accents.accent3
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.6
      ctx.setLineDash([2, 3])
      ctx.beginPath(); ctx.moveTo(threshX, 0); ctx.lineTo(threshX, h); ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1

      // fill area below curve
      ctx.beginPath()
      for (let px = 0; px < w; px++) {
        const inputDb = -rangeDb + (px / w) * rangeDb
        const overDb = inputDb - threshold
        let outputDb: number
        if (overDb <= -halfKnee) {
          outputDb = inputDb + makeup
        } else if (overDb >= halfKnee) {
          outputDb = threshold + overDb / ratio + makeup
        } else {
          outputDb = inputDb + (1 / ratio - 1) * Math.pow(overDb + halfKnee, 2) / (2 * knee) + makeup
        }
        outputDb = Math.max(-rangeDb, Math.min(rangeDb, outputDb))
        const py = h - ((outputDb + rangeDb) / rangeDb) * h
        if (px === 0) ctx.moveTo(0, h)
        ctx.lineTo(px, py)
      }
      ctx.lineTo(w, h)
      ctx.closePath()
      ctx.fillStyle = t.accents.accent0
      ctx.globalAlpha = 0.06
      ctx.fill()
      ctx.globalAlpha = 1

      // compression curve
      ctx.shadowBlur = 6
      ctx.shadowColor = t.accents.accent0
      ctx.strokeStyle = t.accents.accent0
      ctx.lineWidth = 2
      ctx.beginPath()
      for (let px = 0; px < w; px++) {
        const inputDb = -rangeDb + (px / w) * rangeDb
        const overDb = inputDb - threshold
        let outputDb: number
        if (overDb <= -halfKnee) {
          outputDb = inputDb + makeup
        } else if (overDb >= halfKnee) {
          outputDb = threshold + overDb / ratio + makeup
        } else {
          outputDb = inputDb + (1 / ratio - 1) * Math.pow(overDb + halfKnee, 2) / (2 * knee) + makeup
        }
        outputDb = Math.max(-rangeDb, Math.min(rangeDb, outputDb))
        const py = h - ((outputDb + rangeDb) / rangeDb) * h
        if (px === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
      ctx.shadowBlur = 0

      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  if (!mod || !def) return null

  const canvasW = widthPx - 56 // leave room for GR meter column
  const paramEntries = Object.entries(def.params)

  // gr: 0=max reduction, 1=no reduction
  const grPct = Math.max(0, Math.min(1, grLevel))
  const grReductionPct = (1 - grPct) * 100

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '6px 8px', gap: 6, overflow: 'hidden' }}>
      {/* top row: curve + GR meter */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
        <canvas
          ref={canvasRef}
          width={canvasW}
          height={96}
          style={{ width: canvasW, height: 96, borderRadius: 2, display: 'block', flexShrink: 0 }}
        />
        {/* GR meter */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--shade2)', lineHeight: 1 }}>gr</div>
          <div style={{
            flex: 1,
            width: 14,
            background: 'var(--shade0)',
            borderRadius: 1,
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* gain reduction bar fills from top */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: `${grReductionPct}%`,
              background: grReductionPct > 15 ? 'var(--accent2)' : 'var(--accent3)',
              transition: 'height 40ms linear',
            }} />
          </div>
          <div style={{ fontSize: 7, color: 'var(--shade2)', lineHeight: 1 }}>
            {grReductionPct > 0.5 ? `-${grReductionPct.toFixed(0)}` : '0'}
          </div>
        </div>
      </div>

      {/* knobs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
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
