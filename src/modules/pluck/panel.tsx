import { useRef, useEffect } from 'react'
import { useStore } from '../../store'
import { getModule } from '../registry'
import { useTheme } from '../../theme/themeContext'
import { Knob } from '../../components/Knob'
import { GRID_UNIT } from '../../theme/tokens'

export function PluckPanel({ moduleId }: { moduleId: string }) {
  const mod = useStore((s) => s.modules[moduleId])
  const def = mod ? getModule(mod.definitionId) : undefined
  const theme = useTheme()
  const themeRef = useRef(theme)
  const paramsRef = useRef(mod?.params ?? {})
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const timeRef = useRef(0)

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

      timeRef.current += 0.025

      const brightness = p.brightness ?? 0.5
      const decay = p.decay ?? 0.995
      const position = p.position ?? 0.12
      const stiffness = p.stiffness ?? 0.1

      // draw the "string" as a series of harmonic overtones
      // position affects which harmonics are dominant
      const numHarmonics = Math.round(1 + brightness * 7)
      const decayVis = (decay - 0.9) / 0.0999 // normalize to 0-1
      const t_val = timeRef.current

      // string anchor points
      const xLeft = 12
      const xRight = w - 12
      const yCenter = h / 2

      // draw bridge marks
      ctx.fillStyle = t.shades.shade2
      ctx.fillRect(xLeft - 1, h / 4, 2, h / 2)
      ctx.fillRect(xRight - 1, h / 4, 2, h / 2)

      // draw string body (rest position)
      ctx.strokeStyle = t.shades.shade2
      ctx.lineWidth = 0.5
      ctx.setLineDash([2, 3])
      ctx.beginPath()
      ctx.moveTo(xLeft, yCenter)
      ctx.lineTo(xRight, yCenter)
      ctx.stroke()
      ctx.setLineDash([])

      // draw vibrating harmonics
      ctx.shadowBlur = 6
      for (let harm = 1; harm <= numHarmonics; harm++) {
        // position-based amplitude weighting: suppresses harmonics at multiples of 1/position
        const posAtten = Math.abs(Math.sin(Math.PI * position * harm))
        const ampScale = posAtten * (1 / harm) * decayVis * (h * 0.38)

        if (ampScale < 0.5) continue

        const harmFreq = harm * (1 + stiffness * harm * 0.02) // stiffness adds inharmonicity
        const alpha = Math.min(1, ampScale / (h * 0.3)) * (1.3 - harm * 0.15)

        ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
        ctx.strokeStyle = harm === 1 ? t.accents.accent0 : t.accents.accent1
        ctx.shadowColor = harm === 1 ? t.accents.accent0 : t.accents.accent1
        ctx.lineWidth = Math.max(0.5, 2 - harm * 0.2)

        ctx.beginPath()
        for (let px = xLeft; px <= xRight; px += 1) {
          const nx = (px - xLeft) / (xRight - xLeft) // 0-1
          const y = yCenter - Math.sin(nx * Math.PI * harm) * Math.sin(t_val * harmFreq) * ampScale
          if (px === xLeft) ctx.moveTo(px, y)
          else ctx.lineTo(px, y)
        }
        ctx.stroke()
      }

      ctx.globalAlpha = 1
      ctx.shadowBlur = 0

      // pluck position marker
      const posX = xLeft + position * (xRight - xLeft)
      ctx.strokeStyle = t.accents.accent3
      ctx.lineWidth = 1
      ctx.setLineDash([1, 2])
      ctx.beginPath()
      ctx.moveTo(posX, h / 4)
      ctx.lineTo(posX, h * 3 / 4)
      ctx.stroke()
      ctx.setLineDash([])

      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  if (!mod || !def) return null

  const canvasW = widthPx - 16
  const paramEntries = Object.entries(def.params)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 8px', gap: 6, overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        width={canvasW}
        height={56}
        style={{ width: canvasW, height: 56, borderRadius: 2, display: 'block' }}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
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
