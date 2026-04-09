import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store'
import styles from './panel.module.css'

interface KeyboardPanelProps {
  moduleId: string
}

const BASE_MIDI = 60
const MIN_OCTAVE_SHIFT = -3
const MAX_OCTAVE_SHIFT = 3

const KEY_TO_SEMITONE: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
}

function isTextInputTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

function formatMidiNote(midi: number): string {
  const noteNames = [
    'c',
    'c#',
    'd',
    'd#',
    'e',
    'f',
    'f#',
    'g',
    'g#',
    'a',
    'a#',
    'b',
  ]
  const note = noteNames[((midi % 12) + 12) % 12] ?? 'c'
  const octave = Math.floor(midi / 12) - 1
  return `${note}${octave}`
}

const KEY_LAYOUT = [
  { key: 'a', isBlack: false },
  { key: 'w', isBlack: true },
  { key: 's', isBlack: false },
  { key: 'e', isBlack: true },
  { key: 'd', isBlack: false },
  { key: 'f', isBlack: false },
  { key: 't', isBlack: true },
  { key: 'g', isBlack: false },
  { key: 'y', isBlack: true },
  { key: 'h', isBlack: false },
  { key: 'u', isBlack: true },
  { key: 'j', isBlack: false },
  { key: 'k', isBlack: false },
]

export function KeyboardPanel({ moduleId }: KeyboardPanelProps) {
  const selectedModuleIds = useStore((s) => s.selectedModuleIds)
  const setGate = useStore((s) => s.setGate)
  const pressedRef = useRef<Map<string, number>>(new Map())
  const octaveShiftRef = useRef(0)
  const [activeNote, setActiveNote] = useState<number | null>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [octaveShift, setOctaveShift] = useState(0)
  const isSelected = selectedModuleIds.includes(moduleId)

  useEffect(() => {
    function recomputeActiveNote() {
      let next: number | null = null
      let nextKey: string | null = null
      for (const [key, note] of pressedRef.current.entries()) {
        next = note
        nextKey = key
      }
      setActiveNote(next)
      setActiveKey(nextKey)
    }

    function releaseAll() {
      const uniqueNotes = new Set<number>()
      for (const note of pressedRef.current.values()) uniqueNotes.add(note)
      for (const note of uniqueNotes) {
        setGate(moduleId, `note:${note}`, 0)
      }
      pressedRef.current.clear()
      setActiveNote(null)
      setActiveKey(null)
    }

    function applyOctaveShift(nextShift: number) {
      const clamped = Math.max(
        MIN_OCTAVE_SHIFT,
        Math.min(MAX_OCTAVE_SHIFT, nextShift),
      )
      if (clamped === octaveShiftRef.current) return

      const nextPressed = new Map<string, number>()
      for (const [key, oldMidi] of pressedRef.current.entries()) {
        const semitone = KEY_TO_SEMITONE[key]
        if (semitone === undefined) continue
        const newMidi = BASE_MIDI + semitone + clamped * 12
        if (newMidi !== oldMidi) {
          setGate(moduleId, `note:${oldMidi}`, 0)
          setGate(moduleId, `note:${newMidi}`, 1)
        }
        nextPressed.set(key, newMidi)
      }
      pressedRef.current = nextPressed
      octaveShiftRef.current = clamped
      setOctaveShift(clamped)
      recomputeActiveNote()
    }

    if (!isSelected) {
      releaseAll()
      return
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTextInputTarget(e.target)) return

      const key = e.key.toLowerCase()
      if (key === 'z' || key === 'x') {
        e.preventDefault()
        if (e.repeat) return
        applyOctaveShift(octaveShiftRef.current + (key === 'x' ? 1 : -1))
        return
      }

      const semitone = KEY_TO_SEMITONE[key]
      if (semitone === undefined) return

      e.preventDefault()
      if (pressedRef.current.has(key)) return

      const midi = BASE_MIDI + semitone + octaveShiftRef.current * 12
      pressedRef.current.set(key, midi)
      setGate(moduleId, `note:${midi}`, 1)
      recomputeActiveNote()
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      const midi = pressedRef.current.get(key)
      if (midi === undefined) return

      e.preventDefault()
      pressedRef.current.delete(key)
      setGate(moduleId, `note:${midi}`, 0)
      recomputeActiveNote()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', releaseAll)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', releaseAll)
      releaseAll()
    }
  }, [isSelected, moduleId, setGate])

  return (
    <div className={styles.root}>
      <div
        className={styles.armStatus}
        data-selected={isSelected ? 'true' : 'false'}
      >
        {isSelected ? 'armed' : 'select to arm'}
      </div>
      <div className={styles.noteText}>
        {activeNote === null
          ? 'note: -'
          : `note: ${formatMidiNote(activeNote)}`}
      </div>
      <div className={styles.octaveText}>
        {`oct: ${octaveShift >= 0 ? '+' : ''}${octaveShift}`}
      </div>
      <div className={styles.keysGrid}>
        {KEY_LAYOUT.map((entry) => {
          const isActive = isSelected && activeKey === entry.key
          return (
            <div
              key={entry.key}
              className={styles.keyCell}
              data-black={entry.isBlack ? 'true' : 'false'}
              data-active={isActive ? 'true' : 'false'}
            >
              {entry.key}
            </div>
          )
        })}
      </div>
      <div className={styles.footer}>
        z/x octave
      </div>
    </div>
  )
}
