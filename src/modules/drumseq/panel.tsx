import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../../store'
import { internalWorkletId } from '../../store/subpatchSlice'
import styles from './panel.module.css'

const STEP_COUNT = 16
const PATTERN_COUNT = 4

interface PaintState {
  pointerId: number
  trackIndex: number
  targetValue: 0 | 1
}

const TRACKS = [
  { label: '1', paramTrack: 0 },
  { label: '2', paramTrack: 1 },
  { label: '3', paramTrack: 2 },
  { label: '4', paramTrack: 3 },
] as const

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max))
}

function stepParamId(
  patternIndex: number,
  trackIndex: number,
  stepIndex: number,
): string {
  return `p${patternIndex + 1}t${trackIndex + 1}s${stepIndex + 1}`
}

export function DrumSeqPanel({ moduleId }: { moduleId: string }) {
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

  const paintRef = useRef<PaintState | null>(null)
  const [activePaintKey, setActivePaintKey] = useState<string | null>(null)

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
  const patternSpan = clampInt(
    mod?.params.patternSpan ?? PATTERN_COUNT,
    1,
    PATTERN_COUNT,
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

  const finishPaint = useCallback(() => {
    if (!paintRef.current) return
    paintRef.current = null
    setActivePaintKey(null)
    useStore.getState().commitHistory()
  }, [])

  useEffect(() => {
    return () => {
      finishPaint()
    }
  }, [finishPaint])

  useEffect(() => {
    const handleWindowPointerEnd = (event: PointerEvent) => {
      const paint = paintRef.current
      if (!paint || paint.pointerId !== event.pointerId) return
      finishPaint()
    }

    window.addEventListener('pointerup', handleWindowPointerEnd)
    window.addEventListener('pointercancel', handleWindowPointerEnd)
    return () => {
      window.removeEventListener('pointerup', handleWindowPointerEnd)
      window.removeEventListener('pointercancel', handleWindowPointerEnd)
    }
  }, [finishPaint])

  const applyStepValue = useCallback(
    (trackIndex: number, stepIndex: number, nextValue: 0 | 1) => {
      if (stepIndex >= patternLength) return
      const paramId = stepParamId(editingPattern, trackIndex, stepIndex)
      const liveMod = useStore.getState().modules[moduleId]
      const currentValue = (liveMod?.params[paramId] ?? 0) >= 0.5 ? 1 : 0
      if (currentValue === nextValue) return
      setParam(moduleId, paramId, nextValue)
    },
    [editingPattern, moduleId, patternLength, setParam],
  )

  const beginPaint = useCallback(
    (
      e: React.PointerEvent<HTMLButtonElement>,
      trackIndex: number,
      stepIndex: number,
      currentValue: number,
    ) => {
      if (stepIndex >= patternLength) return

      e.preventDefault()
      e.stopPropagation()

      if (paintRef.current) finishPaint()

      const targetValue: 0 | 1 = currentValue >= 0.5 ? 0 : 1
      useStore.getState().stageHistory()
      paintRef.current = {
        pointerId: e.pointerId,
        trackIndex,
        targetValue,
      }
      setActivePaintKey(`${trackIndex}-${stepIndex}`)
      applyStepValue(trackIndex, stepIndex, targetValue)
    },
    [applyStepValue, finishPaint, patternLength],
  )

  const continuePaint = useCallback(
    (
      e: React.PointerEvent<HTMLButtonElement>,
      trackIndex: number,
      stepIndex: number,
    ) => {
      const paint = paintRef.current
      if (!paint || paint.trackIndex !== trackIndex) return
      if (stepIndex >= patternLength || (e.buttons & 1) !== 1) return
      setActivePaintKey(`${trackIndex}-${stepIndex}`)
      applyStepValue(trackIndex, stepIndex, paint.targetValue)
    },
    [applyStepValue, patternLength],
  )

  const handleCellPointerEnd = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const paint = paintRef.current
      if (!paint || paint.pointerId !== e.pointerId) return
      finishPaint()
    },
    [finishPaint],
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

  const setPatternSpan = useCallback(
    (nextSpan: number) => {
      const clampedSpan = clampInt(nextSpan, 1, PATTERN_COUNT)
      if (clampedSpan === patternSpan) return
      useStore.getState().stageHistory()
      setParam(moduleId, 'patternSpan', clampedSpan)
      useStore.getState().commitHistory()
    },
    [moduleId, patternSpan, setParam],
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
            const isEnabled = patternIndex < patternSpan
            return (
              <button
                key={patternIndex}
                type='button'
                className={styles.tabButton}
                data-active={isEditing ? 'true' : 'false'}
                data-playing={isPlaying ? 'true' : 'false'}
                data-enabled={isEnabled ? 'true' : 'false'}
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

        <div className={styles.headerControls}>
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

          <div className={styles.lengthControl}>
            <button
              type='button'
              className={styles.lengthButton}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                setPatternSpan(patternSpan - 1)
              }}
              aria-label='decrease pattern cycle length'
            >
              {'-'}
            </button>
            <div className={styles.lengthValue}>{`pats ${patternSpan}`}</div>
            <button
              type='button'
              className={styles.lengthButton}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                setPatternSpan(patternSpan + 1)
              }}
              aria-label='increase pattern cycle length'
            >
              {'+'}
            </button>
          </div>
        </div>
      </div>

      <div className={styles.contentGroup}>
        <div className={styles.stepNumbers}>
          <div className={styles.rowTagSpacer} />
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

        {TRACKS.map((track) => (
          <div key={track.label} className={styles.trackRow}>
            <div className={styles.rowTag}>{track.label}</div>
            <div className={styles.stepGrid}>
              {stepIndices.map((stepIndex) => {
                const paramId = stepParamId(
                  editingPattern,
                  track.paramTrack,
                  stepIndex,
                )
                const value = mod.params[paramId] ?? 0
                const active = value >= 0.5
                const enabled = stepIndex < patternLength
                const isPlaying =
                  playingInEditedPattern &&
                  enabled &&
                  displayedPlayingStep === stepIndex
                const paintKey = `${track.paramTrack}-${stepIndex}`

                return (
                  <button
                    key={paramId}
                    type='button'
                    className={styles.toggleCell}
                    data-active={active ? 'true' : 'false'}
                    data-enabled={enabled ? 'true' : 'false'}
                    data-playing={isPlaying ? 'true' : 'false'}
                    data-painting={
                      activePaintKey === paintKey ? 'true' : 'false'
                    }
                    data-param-control=''
                    data-module-id={moduleId}
                    data-param-id={paramId}
                    onPointerDown={(e) =>
                      beginPaint(e, track.paramTrack, stepIndex, value)
                    }
                    onPointerEnter={(e) =>
                      continuePaint(e, track.paramTrack, stepIndex)
                    }
                    onPointerUp={handleCellPointerEnd}
                    onPointerCancel={handleCellPointerEnd}
                    onMouseDown={(e) => e.stopPropagation()}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
