import { useRef, useEffect } from 'react'
import { useStore } from '../../store'
import { getModule } from '../registry'
import { useTheme } from '../../theme/themeContext'
import { Knob } from '../../components/Knob'
import { ListSelector } from '../../components/ListSelector'
import { SizedCanvas } from '../../components/SizedCanvas'
import { GRID_UNIT } from '../../theme/tokens'
import styles from './panel.module.css'

// Chord intervals in semitones (root=0)
const CHORD_INTERVALS: number[][] = [
  [0, 4, 7, 12],   // maj
  [0, 3, 7, 12],   // min
  [0, 4, 7, 10],   // dom7
  [0, 4, 7, 11],   // maj7
  [0, 3, 7, 10],   // min7
  [0, 3, 6, 9],    // dim
  [0, 4, 8, 12],   // aug
  [0, 2, 7, 12],   // sus2
  [0, 5, 7, 12],   // sus4
]

// White key indices (in chromatic scale 0-11)
const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11]
// Black key indices
const BLACK_KEYS = [1, 3, -1, 6, 8, 10, -1] // -1 = no black key at that position

export function ChordGenPanel({ moduleId }: { moduleId: string }) {
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

      const chordIdx = Math.max(0, Math.min(8, Math.round(p.chord ?? 0)))
      const intervals = CHORD_INTERVALS[chordIdx] ?? [0, 4, 7, 12]
      // The visual always shows the chord from C (root=0)
      // Map intervals to chromatic positions mod 12
      const activeNotes = new Set<number>()
      for (const interval of intervals) {
        activeNotes.add((interval ?? 0) % 12)
      }

      const numWhite = 8 // C to C (one octave + root)
      const keyW = Math.floor(w / numWhite)
      const keyH = h - 2

      // draw white keys
      for (let wi = 0; wi < 8; wi++) {
        const chromIdx = wi < 7 ? WHITE_KEYS[wi] : 0 // last key is octave C
        const isActive = chromIdx !== undefined && activeNotes.has(chromIdx)
        const x = wi * keyW + 1

        ctx.fillStyle = isActive ? t.accents.accent0 : t.shades.shade3
        ctx.fillRect(x, 1, keyW - 2, keyH)
        ctx.strokeStyle = t.shades.shade0
        ctx.lineWidth = 1
        ctx.strokeRect(x, 1, keyW - 2, keyH)

        // note label on root (C keys)
        if (chromIdx === 0) {
          ctx.fillStyle = isActive ? t.shades.shade0 : t.shades.shade1
          ctx.font = `7px monospace`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'bottom'
          ctx.fillText('c', x + (keyW - 2) / 2, keyH - 1)
        }
      }

      // draw black keys on top
      for (let wi = 0; wi < 7; wi++) {
        const bkChromatic = BLACK_KEYS[wi]
        if (bkChromatic === undefined || bkChromatic === -1) continue
        const isActive = activeNotes.has(bkChromatic)
        const x = (wi + 1) * keyW - Math.floor(keyW * 0.3)
        const bkW = Math.floor(keyW * 0.6)
        const bkH = Math.floor(keyH * 0.6)

        ctx.fillStyle = isActive ? t.accents.accent1 : t.shades.shade1
        ctx.fillRect(x, 1, bkW, bkH)
        if (isActive) {
          ctx.shadowBlur = 4
          ctx.shadowColor = t.accents.accent1
        }
        ctx.shadowBlur = 0
      }

      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  if (!mod || !def) return null

  const canvasW = widthPx - 16
  const chordDef = def.params['chord']
  const octaveDef = def.params['octave']
  const spreadDef = def.params['spread']

  return (
    <div className={styles.root}>
      {/* piano keyboard */}
      <SizedCanvas
        ref={canvasRef}
        pixelWidth={canvasW}
        pixelHeight={44}
        className={styles.canvas}
      />

      {/* controls row */}
      <div className={styles.controlsRow}>
        {chordDef && (
          <ListSelector
            moduleId={moduleId}
            paramId="chord"
            definition={chordDef}
            value={mod.params['chord'] ?? chordDef.default}
          />
        )}
        <div className={styles.knobColumn}>
          {octaveDef && (
            <Knob
              moduleId={moduleId}
              paramId="octave"
              definition={octaveDef}
              value={mod.params['octave'] ?? octaveDef.default}
            />
          )}
          {spreadDef && (
            <Knob
              moduleId={moduleId}
              paramId="spread"
              definition={spreadDef}
              value={mod.params['spread'] ?? spreadDef.default}
            />
          )}
        </div>
      </div>
    </div>
  )
}
