import { useRef, useEffect } from 'react'
import { useTheme } from '../theme/ThemeProvider'
import type { Theme } from '../theme/tokens'

interface CanvasZoneProps {
  width: number   // px
  height: number  // px
  render: (ctx: CanvasRenderingContext2D, data: CanvasData) => void
  moduleParams?: Record<string, number>
  scopeBuffer?: Float32Array | null
  writeIndexBuffer?: Int32Array | null
}

export interface CanvasData {
  theme: Theme
  scopeBuffer?: Float32Array | null
  writeIndexBuffer?: Int32Array | null
  moduleParams: Record<string, number>
  width: number
  height: number
}

export function CanvasZone({
  width,
  height,
  render,
  moduleParams = {},
  scopeBuffer = null,
  writeIndexBuffer = null,
}: CanvasZoneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const theme = useTheme()

  // store latest values in refs so the animation loop always reads fresh data
  const renderRef = useRef(render)
  const themeRef = useRef(theme)
  const paramsRef = useRef(moduleParams)

  useEffect(() => { renderRef.current = render }, [render])
  useEffect(() => { themeRef.current = theme }, [theme])
  useEffect(() => { paramsRef.current = moduleParams }, [moduleParams])

  useEffect(() => {
    const loop = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.clearRect(0, 0, width, height)

      renderRef.current(ctx, {
        theme: themeRef.current,
        scopeBuffer,
        writeIndexBuffer,
        moduleParams: paramsRef.current,
        width,
        height,
      })

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [width, height, scopeBuffer, writeIndexBuffer])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        width,
        height,
        display: 'block',
        borderRadius: 2,
        background: 'var(--shade0)',
      }}
    />
  )
}
