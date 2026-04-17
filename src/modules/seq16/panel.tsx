import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useStore } from '../../store'
import { internalWorkletId } from '../../store/subpatchSlice'
import styles from './panel.module.css'

const STEP_COUNT = 16
const PATTERN_COUNT = 4
const NOTE_MIN = -24
const NOTE_MAX = 24
const NOTE_DRAG_SENSITIVITY = 0.28
const NOTE_DRAG_FINE_SENSITIVITY = 0.08
const VELOCITY_DRAG_SENSITIVITY = 0.01
const VELOCITY_DRAG_FINE_SENSITIVITY = 0.003

interface DragState {
  pointerId: number
  kind: 'note' | 'velocity'
  patternIndex: number
  stepIndex: number
  rawValue: number
  lastSent: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max))
}

function noteParamId(patternIndex: number, stepIndex: number): string {
  return `p${patternIndex + 1}n${stepIndex + 1}`
}

function velocityParamId(patternIndex: number, stepIndex: number): string {
  return `p${patternIndex + 1}v${stepIndex + 1}`
}

export function Seq16Panel({ moduleId }: { moduleId: string }) {
  const mod = useStore((s) => s.modules[moduleId])
  const setParam = useStore((s) => s.setParam)
  const setModuleDataValue = useStore((s) => s.setModuleDataValue)
  const setIndicatorBuffer = useStore((s) => s.setIndicatorBuffer)
  const engineRevision = useStore((s) => s.engineRevision)
  const currentInstanceId = useStore(
    (s) => s.subpatchContext[s.subpatchContext.length - 1]?.instanceId,
  )

  const workletModuleId = currentInstanceId
    ? internalWorkletId(currentInstanceId, moduleId)
    : moduleId

  const dragRef = useRef<DragState | null>(null)
  const [activeDragKey, setActiveDragKey] = useState<string | null>(null)

  const manualPattern = clampInt(
    mod?.params.playPattern ?? 0,
    0,
    PATTERN_COUNT - 1,
  )
  const storedEditingPattern = Number.parseInt(
    mod?.data?.editPattern ?? `${manualPattern}`,
    10,
  )
  const editingPattern = Number.isFinite(storedEditingPattern)
    ? clampInt(storedEditingPattern, 0, PATTERN_COUNT - 1)
    : manualPattern
  const patternLength = clampInt(
    mod?.params.length ?? STEP_COUNT,
    1,
    STEP_COUNT,
  )

  const indicatorBuffer = useMemo(() => {
    try {
      const sab = new SharedArrayBuffer(2 * Int32Array.BYTES_PER_ELEMENT)
      return new Int32Array(sab)
    } catch {
      return null
    }
  }, [])

  const [playingPattern, setPlayingPattern] = useState(manualPattern)
  const [playingStep, setPlayingStep] = useState(0)

  useEffect(() => {
    if (!indicatorBuffer) return
    setIndicatorBuffer(
      workletModuleId,
      indicatorBuffer.buffer as SharedArrayBuffer,
    )
  }, [workletModuleId, indicatorBuffer, engineRevision, setIndicatorBuffer])

  useEffect(() => {
    if (!indicatorBuffer) return

    let rafId = 0
    let prevPattern = -1
    let prevStep = -1

    const update = () => {
      const nextPattern = clampInt(
        Atomics.load(indicatorBuffer, 0),
        0,
        PATTERN_COUNT - 1,
      )
      const maxVisibleStep = Math.max(0, patternLength - 1)
      const nextStep = clampInt(
        Atomics.load(indicatorBuffer, 1),
        0,
        maxVisibleStep,
      )

      if (nextPattern !== prevPattern || nextStep !== prevStep) {
        prevPattern = nextPattern
        prevStep = nextStep
        setPlayingPattern(nextPattern)
        setPlayingStep(nextStep)
      }

      rafId = requestAnimationFrame(update)
    }

    rafId = requestAnimationFrame(update)
    return () => cancelAnimationFrame(rafId)
  }, [indicatorBuffer, patternLength])

  const finishDrag = useCallback(() => {
    if (!dragRef.current) return
    dragRef.current = null
    setActiveDragKey(null)
    document.exitPointerLock()
    useStore.getState().commitHistory()
  }, [])

  useEffect(() => {
    return () => {
      finishDrag()
    }
  }, [finishDrag])

  useEffect(() => {
    const handlePointerLockChange = () => {
      if (!document.pointerLockElement && dragRef.current) {
        finishDrag()
      }
    }
    document.addEventListener('pointerlockchange', handlePointerLockChange)
    return () => {
      document.removeEventListener('pointerlockchange', handlePointerLockChange)
    }
  }, [finishDrag])

  const beginDrag = useCallback(
    (
      e: React.PointerEvent<HTMLElement>,
      kind: 'note' | 'velocity',
      stepIndex: number,
      initialValue: number,
    ) => {
      if (stepIndex >= patternLength) return
      e.preventDefault()
      e.stopPropagation()

      if (dragRef.current) finishDrag()

      useStore.getState().stageHistory()
      e.currentTarget.setPointerCapture(e.pointerId)

      dragRef.current = {
        pointerId: e.pointerId,
        kind,
        patternIndex: editingPattern,
        stepIndex,
        rawValue: initialValue,
        lastSent: initialValue,
      }
      setActiveDragKey(`${kind}-${stepIndex}`)
      e.currentTarget.requestPointerLock()
    },
    [editingPattern, finishDrag, patternLength],
  )

  const handleCellPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return

      if (drag.kind === 'note') {
        const sensitivity = e.shiftKey
          ? NOTE_DRAG_FINE_SENSITIVITY
          : NOTE_DRAG_SENSITIVITY
        const nextRaw = clamp(
          drag.rawValue - e.movementY * sensitivity,
          NOTE_MIN,
          NOTE_MAX,
        )
        const nextValue = Math.round(nextRaw)
        drag.rawValue = nextRaw

        if (nextValue !== Math.round(drag.lastSent)) {
          setParam(
            moduleId,
            noteParamId(drag.patternIndex, drag.stepIndex),
            nextValue,
          )
          drag.lastSent = nextValue
        }
        return
      }

      const sensitivity = e.shiftKey
        ? VELOCITY_DRAG_FINE_SENSITIVITY
        : VELOCITY_DRAG_SENSITIVITY
      const nextRaw = clamp(drag.rawValue - e.movementY * sensitivity, 0, 1)
      const nextValue = Math.round(nextRaw * 1000) / 1000
      drag.rawValue = nextRaw

      if (Math.abs(nextValue - drag.lastSent) > 0.0005) {
        setParam(
          moduleId,
          velocityParamId(drag.patternIndex, drag.stepIndex),
          nextValue,
        )
        drag.lastSent = nextValue
      }
    },
    [moduleId, setParam],
  )

  const handleCellPointerEnd = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
      finishDrag()
    },
    [finishDrag],
  )

  const handlePatternTabClick = useCallback(
    (patternIndex: number) => {
      const clampedIndex = clampInt(patternIndex, 0, PATTERN_COUNT - 1)
      setModuleDataValue(moduleId, 'editPattern', String(clampedIndex))
    },
    [moduleId, setModuleDataValue],
  )

  const setLength = useCallback(
    (nextLength: number) => {
      const clampedLength = clampInt(nextLength, 1, STEP_COUNT)
      if (clampedLength === patternLength) return
      useStore.getState().stageHistory()
      setParam(moduleId, 'length', clampedLength)
      useStore.getState().commitHistory()
    },
    [moduleId, patternLength, setParam],
  )

  const stepIndices = useMemo(
    () => Array.from({ length: STEP_COUNT }, (_, i) => i),
    [],
  )

  if (!mod) return null

  const displayedPlayingPattern = indicatorBuffer
    ? playingPattern
    : manualPattern
  const displayedPlayingStep = indicatorBuffer ? playingStep : 0
  const playingInEditedPattern = displayedPlayingPattern === editingPattern

  return (
    <div className={styles.root}>
      <div className={styles.topRow}>
        <div className={styles.tabs}>
          {Array.from({ length: PATTERN_COUNT }, (_, patternIndex) => {
            const isEditing = patternIndex === editingPattern
            const isPlaying = patternIndex === displayedPlayingPattern
            return (
              <button
                key={patternIndex}
                type='button'
                className={styles.tabButton}
                data-active={isEditing ? 'true' : 'false'}
                data-playing={isPlaying ? 'true' : 'false'}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  handlePatternTabClick(patternIndex)
                }}
              >
                {`p${patternIndex + 1}`}
              </button>
            )
          })}
        </div>

        <div className={styles.lengthControl}>
          <button
            type='button'
            className={styles.lengthButton}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              setLength(patternLength - 1)
            }}
            aria-label='decrease sequence length'
          >
            {'-'}
          </button>
          <div className={styles.lengthValue}>{`len ${patternLength}`}</div>
          <button
            type='button'
            className={styles.lengthButton}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              setLength(patternLength + 1)
            }}
            aria-label='increase sequence length'
          >
            {'+'}
          </button>
        </div>
      </div>

      <div className={styles.contentGroup}>
        <div className={styles.stepNumbers}>
          {stepIndices.map((stepIndex) => {
            const enabled = stepIndex < patternLength
            const isPlaying =
              playingInEditedPattern &&
              enabled &&
              displayedPlayingStep === stepIndex
            return (
              <div
                key={stepIndex}
                className={styles.stepNumber}
                data-enabled={enabled ? 'true' : 'false'}
                data-playing={isPlaying ? 'true' : 'false'}
                data-quarter={stepIndex % 4 === 0 ? 'true' : 'false'}
              >
                {stepIndex + 1}
              </div>
            )
          })}
        </div>

        <div className={styles.rowLabel}>note (semitones)</div>
        <div className={styles.stepGrid}>
          {stepIndices.map((stepIndex) => {
            const paramId = noteParamId(editingPattern, stepIndex)
            const value = clampInt(mod.params[paramId] ?? 0, NOTE_MIN, NOTE_MAX)
            const enabled = stepIndex < patternLength
            const isPlaying =
              playingInEditedPattern &&
              enabled &&
              displayedPlayingStep === stepIndex
            const dragKey = `note-${stepIndex}`

            return (
              <button
                key={paramId}
                type='button'
                className={styles.noteCell}
                data-enabled={enabled ? 'true' : 'false'}
                data-playing={isPlaying ? 'true' : 'false'}
                data-dragging={activeDragKey === dragKey ? 'true' : 'false'}
                data-param-control=''
                data-module-id={moduleId}
                data-param-id={paramId}
                onPointerDown={(e) => beginDrag(e, 'note', stepIndex, value)}
                onPointerMove={handleCellPointerMove}
                onPointerUp={handleCellPointerEnd}
                onPointerCancel={handleCellPointerEnd}
                onMouseDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  if (!enabled || value === 0) return
                  useStore.getState().stageHistory()
                  setParam(moduleId, paramId, 0)
                  useStore.getState().commitHistory()
                }}
              >
                {value}
              </button>
            )
          })}
        </div>

        <div className={styles.rowLabel}>velocity</div>
        <div className={styles.stepGrid}>
          {stepIndices.map((stepIndex) => {
            const paramId = velocityParamId(editingPattern, stepIndex)
            const value = clamp(mod.params[paramId] ?? 1, 0, 1)
            const enabled = stepIndex < patternLength
            const dragKey = `velocity-${stepIndex}`
            const velocityStyle = {
              '--velocity-fill': `${Math.round(value * 100)}%`,
            } as CSSProperties

            return (
              <button
                key={paramId}
                type='button'
                className={styles.velocityCell}
                data-enabled={enabled ? 'true' : 'false'}
                data-dragging={activeDragKey === dragKey ? 'true' : 'false'}
                data-param-control=''
                data-module-id={moduleId}
                data-param-id={paramId}
                onPointerDown={(e) =>
                  beginDrag(e, 'velocity', stepIndex, value)
                }
                onPointerMove={handleCellPointerMove}
                onPointerUp={handleCellPointerEnd}
                onPointerCancel={handleCellPointerEnd}
                onMouseDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  if (!enabled || Math.abs(value - 1) < 0.0005) return
                  useStore.getState().stageHistory()
                  setParam(moduleId, paramId, 1)
                  useStore.getState().commitHistory()
                }}
              >
                <div className={styles.velocityFill} style={velocityStyle} />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
