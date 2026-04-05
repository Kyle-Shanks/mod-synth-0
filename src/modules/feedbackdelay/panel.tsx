import { useRef, useEffect } from 'react'
import { useStore } from '../../store'
import { getModule } from '../registry'
import { useTheme } from '../../theme/themeContext'
import { Knob } from '../../components/Knob'
import { GRID_UNIT } from '../../theme/tokens'

export function FeedbackDelayPanel({ moduleId }: { moduleId: string }) {
  const mod = useStore((s) => s.modules[moduleId])
  const def = mod ? getModule(mod.definitionId) : undefined
  const theme = useTheme()
  const themeRef = useRef(theme)
  const paramsRef = useRef(mod?.params ?? {})
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    themeRef.current = theme
  }, [theme])
  useEffect(() => {
    paramsRef.current = mod?.params ?? {}
  }, [mod?.params])

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

      // subtle grid
      ctx.strokeStyle = t.shades.shade2
      ctx.lineWidth = 0.5
      ctx.globalAlpha = 0.2
      for (let x = 0; x < w; x += 32) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      const feedback = p.feedback ?? 0.5
      const mix = p.mix ?? 0.4

      // draw center line
      ctx.strokeStyle = t.shades.shade2
      ctx.lineWidth = 0.5
      ctx.setLineDash([2, 4])
      ctx.beginPath()
      ctx.moveTo(0, h / 2)
      ctx.lineTo(w, h / 2)
      ctx.stroke()
      ctx.setLineDash([])

      // dry signal marker
      const maxH = h * 0.4
      const dryH = maxH * (1 - mix)
      ctx.strokeStyle = t.shades.shade3
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(16, h / 2 - dryH)
      ctx.lineTo(16, h / 2 + dryH)
      ctx.stroke()

      // echo bars: evenly spaced, each diminishing by feedback amount
      const maxEchoes = 10
      const spacing = (w - 24) / maxEchoes
      let amp = mix
      for (let e = 0; e < maxEchoes; e++) {
        if (amp < 0.015) break
        const x = 32 + e * spacing
        const bH = maxH * amp

        // glow effect
        ctx.shadowBlur = 6
        ctx.shadowColor = t.accents.accent0

        const alpha = Math.min(1, amp * 1.5)
        ctx.globalAlpha = alpha
        ctx.strokeStyle = t.accents.accent0
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.moveTo(x, h / 2 - bH)
        ctx.lineTo(x, h / 2 + bH)
        ctx.stroke()

        ctx.shadowBlur = 0
        ctx.globalAlpha = 1
        amp *= feedback
      }

      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  if (!mod || !def) return null

  const canvasW = widthPx - 16
  const paramEntries = Object.entries(def.params)

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '6px 8px',
        gap: 6,
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        width={canvasW}
        height={56}
        style={{
          width: canvasW,
          height: 56,
          borderRadius: 2,
          display: 'block',
        }}
      />
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
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
