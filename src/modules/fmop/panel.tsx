import { useRef, useEffect } from 'react'
import { useStore } from '../../store'
import { getModule } from '../registry'
import { useTheme } from '../../theme/themeContext'
import { Knob } from '../../components/Knob'
import { GRID_UNIT } from '../../theme/tokens'

export function FMOpPanel({ moduleId }: { moduleId: string }) {
  const mod = useStore((s) => s.modules[moduleId])
  const def = mod ? getModule(mod.definitionId) : undefined
  const theme = useTheme()
  const themeRef = useRef(theme)
  const paramsRef = useRef(mod?.params ?? {})
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => { themeRef.current = theme }, [theme])
  useEffect(() => { paramsRef.current = mod?.params ?? {} }, [mod?.params])

  const widthPx = def ? def.width * GRID_UNIT : 192

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

      const ratio = p.ratio ?? 1
      const index = p.index ?? 2
      const twoPi = 2 * Math.PI

      // draw computed FM waveform: y = sin(x + index * sin(ratio * x))
      ctx.shadowBlur = 8
      ctx.shadowColor = t.accents.accent1
      ctx.strokeStyle = t.accents.accent1
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (let px = 0; px < w; px++) {
        const x = (px / w) * twoPi
        const y = Math.sin(x + (index / 4) * Math.sin(ratio * x))
        const py = h / 2 - y * (h * 0.42)
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

  const canvasW = widthPx - 16
  const ratio = mod.params.ratio ?? 1
  // Format ratio nicely: show as N:1 if integer, else decimal
  const ratioInt = Math.round(ratio)
  const ratioLabel = Math.abs(ratio - ratioInt) < 0.05 ? `${ratioInt}:1` : `${ratio.toFixed(2)}:1`

  const paramEntries = Object.entries(def.params)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 8px', gap: 4, overflow: 'hidden' }}>
      {/* ratio readout */}
      <div style={{
        fontSize: 'var(--text-md)',
        color: 'var(--accent1)',
        letterSpacing: '0.1em',
        lineHeight: 1,
        paddingTop: 2,
      }}>
        {ratioLabel}
      </div>

      {/* fm waveform preview */}
      <canvas
        ref={canvasRef}
        width={canvasW}
        height={44}
        style={{ width: canvasW, height: 44, borderRadius: 2, display: 'block' }}
      />

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
