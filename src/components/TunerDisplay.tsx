import { useEffect, useRef } from 'react'
import { useTheme } from '../theme/themeContext'
import { drawTunerCents } from './canvasPrimitives'
import styles from './TunerDisplay.module.css'

const NOTE_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b']

interface TunerDisplayProps {
  moduleId: string
  tunerBuffer: Float32Array | null
}

// Rolling median window. Each detection arrives every ~11.6ms (512 samples @ 44100Hz).
// Median of 9 readings = ~104ms of history — better stability against jitter.
const HISTORY = 9
// Min readings before showing anything (avoids flicker on first connection).
const MIN_DISPLAY = 3
// Needle smoothing coefficient — slightly slower for steadier movement.
const NEEDLE_ALPHA = 0.25
// UI acceptance threshold for detector confidence.
const CLARITY_MIN = 0.35

export function TunerDisplay({ tunerBuffer }: TunerDisplayProps) {
  const noteRef   = useRef<HTMLDivElement | null>(null)
  const centsRef  = useRef<HTMLDivElement | null>(null)
  const freqRef   = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const theme = useTheme()
  const themeRef = useRef(theme)
  useEffect(() => { themeRef.current = theme }, [theme])

  // rolling window of recent semitone readings (only valid detections)
  const semiWindowRef   = useRef<number[]>([])
  // smoothed semitone value used for the needle and readouts
  const smoothedSemiRef = useRef<number | null>(null)

  useEffect(() => {
    semiWindowRef.current   = []
    smoothedSemiRef.current = null
  }, [tunerBuffer])

  useEffect(() => {
    let rafId: number

    const animate = () => {
      const rawFreq    = tunerBuffer?.[0] ?? 0
      const rawClarity = tunerBuffer?.[1] ?? 0

      // Ingest every frame. The detector can hold a stable value for many frames.
      const win = semiWindowRef.current
      if (rawFreq > 20 && rawClarity > CLARITY_MIN) {
        win.push(12 * Math.log2(rawFreq / 440) + 69)
        if (win.length > HISTORY) win.shift()
      } else {
        // bad detection: drain one slot so silence clears the window gradually
        if (win.length > 0) win.shift()
      }

      if (win.length >= MIN_DISPLAY) {
        // median of the window — robust against octave-error outliers
        const sorted  = win.slice().sort((a, b) => a - b)
        const medSemi = sorted[Math.floor(sorted.length / 2)]!

        // light smoothing for a stable needle on sustained notes
        if (smoothedSemiRef.current === null) {
          smoothedSemiRef.current = medSemi
        } else {
          smoothedSemiRef.current += (medSemi - smoothedSemiRef.current) * NEEDLE_ALPHA
        }
        const semi = smoothedSemiRef.current

        const noteIdx = ((Math.round(semi) % 12) + 12) % 12
        const note    = NOTE_NAMES[noteIdx] ?? '?'
        const octave  = Math.floor(Math.round(semi) / 12) - 1
        const cents   = (semi - Math.round(semi)) * 100
        const freq    = 440 * Math.pow(2, (semi - 69) / 12)

        const noteEl  = noteRef.current
        const centsEl = centsRef.current
        const freqEl  = freqRef.current

        if (noteEl)  noteEl.textContent  = note + octave
        if (centsEl) centsEl.textContent = (cents >= 0 ? '+' : '') + cents.toFixed(0) + '¢'
        if (freqEl)  freqEl.textContent  = freq.toFixed(1) + ' hz'

        const canvas = canvasRef.current
        if (canvas) {
          const ctx = canvas.getContext('2d')
          if (ctx) {
            const t = themeRef.current
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.strokeStyle = t.shades.shade2
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(canvas.width / 2, 0)
            ctx.lineTo(canvas.width / 2, canvas.height)
            ctx.stroke()
            const absCents = Math.abs(cents)
            const barColor = absCents < 5 ? t.accents.accent1 : absCents < 20 ? t.accents.accent3 : t.accents.accent2
            drawTunerCents(ctx, cents, rawClarity, canvas.width, canvas.height, barColor)
          }
        }
      } else {
        smoothedSemiRef.current = null
        const noteEl  = noteRef.current
        const centsEl = centsRef.current
        const freqEl  = freqRef.current
        if (noteEl)  noteEl.textContent  = '--'
        if (centsEl) centsEl.textContent = '--'
        if (freqEl)  freqEl.textContent  = '-- hz'

        const canvas = canvasRef.current
        if (canvas) {
          const ctx = canvas.getContext('2d')
          ctx?.clearRect(0, 0, canvas.width, canvas.height)
        }
      }

      rafId = requestAnimationFrame(animate)
    }

    rafId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId)
  }, [tunerBuffer])

  return (
    <div className={styles.root}>
      {/* note name */}
      <div ref={noteRef} className={styles.note}>
        --
      </div>

      {/* cents offset */}
      <div ref={centsRef} className={styles.cents}>
        --
      </div>

      {/* cents bar canvas */}
      <canvas
        ref={canvasRef}
        width={128}
        height={8}
        className={styles.centsCanvas}
      />

      {/* frequency readout */}
      <div ref={freqRef} className={styles.frequency}>
        -- hz
      </div>
    </div>
  )
}
