import { useRef, useEffect } from 'react'
import { useTheme } from '../theme/themeContext'
import type { Theme } from '../theme/tokens'
import { SizedCanvas } from './SizedCanvas'
import styles from './CanvasZone.module.css'

interface CanvasZoneProps {
  width: number   // px
  height: number  // px
  render: (ctx: CanvasRenderingContext2D, data: CanvasData) => void
  clearEachFrame?: boolean
  moduleParams?: Record<string, number>
  scopeBuffer?: Float32Array | null
  writeIndexBuffer?: Int32Array | null
  xBuffer?: Float32Array | null
  yBuffer?: Float32Array | null
}

export interface CanvasData {
  theme: Theme
  scopeBuffer?: Float32Array | null
  writeIndexBuffer?: Int32Array | null
  xBuffer?: Float32Array | null
  yBuffer?: Float32Array | null
  moduleParams: Record<string, number>
  width: number
  height: number
}

export function CanvasZone({
  width,
  height,
  render,
  clearEachFrame = true,
  moduleParams = {},
  scopeBuffer = null,
  writeIndexBuffer = null,
  xBuffer = null,
  yBuffer = null,
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

      if (clearEachFrame) {
        ctx.clearRect(0, 0, width, height)
      }

      renderRef.current(ctx, {
        theme: themeRef.current,
        scopeBuffer,
        writeIndexBuffer,
        xBuffer,
        yBuffer,
        moduleParams: paramsRef.current,
        width,
        height,
      })

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [width, height, clearEachFrame, scopeBuffer, writeIndexBuffer, xBuffer, yBuffer])

  return (
    <SizedCanvas
      ref={canvasRef}
      pixelWidth={width}
      pixelHeight={height}
      className={styles.canvas}
    />
  )
}
