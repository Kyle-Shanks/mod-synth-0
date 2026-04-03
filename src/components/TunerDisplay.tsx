import { useEffect, useRef } from 'react'

const NOTE_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b']

interface TunerDisplayProps {
  moduleId: string
  tunerBuffer: Float32Array | null
}

// Rolling median window. Each detection arrives every ~11.6ms (512 samples @ 44100Hz).
// Median of 7 readings = ~80ms of history — immune to octave-error outliers.
const HISTORY = 7
// Min readings before showing anything (avoids flicker on first connection).
const MIN_DISPLAY = 3
// Needle smoothing coefficient — fast enough to feel live on sustained notes.
const NEEDLE_ALPHA = 0.35

export function TunerDisplay({ tunerBuffer }: TunerDisplayProps) {
  const noteRef  = useRef<HTMLDivElement | null>(null)
  const centsRef = useRef<HTMLDivElement | null>(null)
  const freqRef  = useRef<HTMLDivElement | null>(null)
  const barRef   = useRef<HTMLDivElement | null>(null)

  // rolling window of recent semitone readings (only valid detections)
  const semiWindowRef   = useRef<number[]>([])
  // track last freq written by worklet to detect new detections
  const lastRawFreqRef  = useRef<number>(0)
  // smoothed semitone value used for the needle and readouts
  const smoothedSemiRef = useRef<number | null>(null)

  useEffect(() => {
    semiWindowRef.current   = []
    lastRawFreqRef.current  = 0
    smoothedSemiRef.current = null
  }, [tunerBuffer])

  useEffect(() => {
    let rafId: number

    const animate = () => {
      const rawFreq    = tunerBuffer?.[0] ?? 0
      const rawClarity = tunerBuffer?.[1] ?? 0

      // --- ingest new detection if the worklet wrote a new value ---
      if (rawFreq !== lastRawFreqRef.current) {
        lastRawFreqRef.current = rawFreq
        const win = semiWindowRef.current

        if (rawFreq > 20 && rawClarity > 0.5) {
          win.push(12 * Math.log2(rawFreq / 440) + 69)
          if (win.length > HISTORY) win.shift()
        } else {
          // bad detection: drain one slot so silence clears the window gradually
          if (win.length > 0) win.shift()
        }
      }

      const win = semiWindowRef.current

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

        const noteEl = noteRef.current
        const centsEl = centsRef.current
        const freqEl = freqRef.current
        const barEl  = barRef.current

        if (noteEl)  noteEl.textContent  = note + octave
        if (centsEl) centsEl.textContent = (cents >= 0 ? '+' : '') + cents.toFixed(0) + '¢'
        if (freqEl)  freqEl.textContent  = freq.toFixed(1) + ' hz'

        const barFraction = Math.max(0, Math.min(1, (cents + 50) / 100))
        if (barEl) {
          barEl.style.left = `${barFraction * 100}%`
          barEl.style.background = Math.abs(cents) < 5 ? 'var(--accent1)' : 'var(--accent2)'
        }
      } else {
        smoothedSemiRef.current = null
        const noteEl = noteRef.current
        const centsEl = centsRef.current
        const freqEl = freqRef.current
        const barEl  = barRef.current
        if (noteEl)  noteEl.textContent  = '--'
        if (centsEl) centsEl.textContent = '--'
        if (freqEl)  freqEl.textContent  = '-- hz'
        if (barEl)   barEl.style.left    = '50%'
      }

      rafId = requestAnimationFrame(animate)
    }

    rafId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId)
  }, [tunerBuffer])

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '6px 8px',
      }}
    >
      {/* note name */}
      <div
        ref={noteRef}
        style={{
          fontSize: 'var(--text-lg)',
          color: 'var(--accent0)',
          letterSpacing: '0.05em',
          lineHeight: 1,
        }}
      >
        --
      </div>

      {/* cents offset */}
      <div
        ref={centsRef}
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--shade3)',
          lineHeight: 1,
        }}
      >
        --
      </div>

      {/* cents bar track */}
      <div
        style={{
          width: '100%',
          height: 6,
          background: 'var(--shade0)',
          border: '1px solid var(--shade2)',
          borderRadius: 1,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* center marker */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            bottom: 0,
            width: 1,
            background: 'var(--shade3)',
            transform: 'translateX(-50%)',
          }}
        />
        {/* needle */}
        <div
          ref={barRef}
          style={{
            position: 'absolute',
            top: 1,
            bottom: 1,
            width: 3,
            background: 'var(--accent2)',
            borderRadius: 1,
            transform: 'translateX(-50%)',
            left: '50%',
            transition: 'left 0.05s linear',
          }}
        />
      </div>

      {/* frequency readout */}
      <div
        ref={freqRef}
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--shade3)',
          lineHeight: 1,
        }}
      >
        -- hz
      </div>
    </div>
  )
}
