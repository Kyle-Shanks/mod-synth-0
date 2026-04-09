import { useCallback, useEffect, useRef, useState } from 'react'
import type { ParamDefinition } from '../engine/types'
import { useStore } from '../store'
import { internalWorkletId } from '../store/subpatchSlice'
import styles from './MixerMasterFader.module.css'

const DRAG_SENSITIVITY = 0.004
const FINE_MULTIPLIER = 0.1
const ATTACK = 0.9
const RELEASE = 0.18
const TRACK_HEIGHT = 76
const TRACK_INSET = 1
const TRACK_ACTIVE_HEIGHT = TRACK_HEIGHT - TRACK_INSET * 2

interface MixerMasterFaderProps {
  moduleId: string
  paramId: string
  definition: ParamDefinition
  value: number
  muteParamId: string
  muted: boolean
}

function classes(...tokens: Array<string | false | null | undefined>): string {
  return tokens.filter(Boolean).join(' ')
}

export function MixerMasterFader({
  moduleId,
  paramId,
  definition,
  value,
  muteParamId,
  muted,
}: MixerMasterFaderProps) {
  const setParam = useStore((s) => s.setParam)
  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ currentValue: number } | null>(null)
  const elRef = useRef<HTMLDivElement>(null)

  const fillLRef = useRef<HTMLDivElement | null>(null)
  const fillRRef = useRef<HTMLDivElement | null>(null)
  const meterTargetRef = useRef({ l: 0, r: 0 })
  const meterDisplayRef = useRef({ l: 0, r: 0 })

  const min = definition.min ?? 0
  const max = definition.max ?? 1
  const range = max - min
  const normalized = range > 0 ? (value - min) / range : 0
  const thumbTop =
    TRACK_INSET + (1 - normalized) * Math.max(0, TRACK_ACTIVE_HEIGHT - 1)

  useEffect(() => {
    return useStore.subscribe((state) => {
      const ctx = state.subpatchContext
      const instanceId = ctx[ctx.length - 1]?.instanceId
      const workletId = instanceId
        ? internalWorkletId(instanceId, moduleId)
        : moduleId
      meterTargetRef.current.l = state.meterValues[`${workletId}:masterL`] ?? 0
      meterTargetRef.current.r = state.meterValues[`${workletId}:masterR`] ?? 0
    })
  }, [moduleId])

  useEffect(() => {
    let rafId: number

    const animate = () => {
      const target = meterTargetRef.current
      const current = meterDisplayRef.current

      current.l +=
        (target.l - current.l) * (target.l > current.l ? ATTACK : RELEASE)
      current.r +=
        (target.r - current.r) * (target.r > current.r ? ATTACK : RELEASE)

      const fillL = fillLRef.current
      if (fillL) {
        const h = Math.round(Math.min(1, current.l) * TRACK_ACTIVE_HEIGHT)
        fillL.style.height = `${h}px`
        fillL.style.background =
          current.l > 0.9 ? 'var(--accent2)' : 'var(--accent1)'
      }
      const fillR = fillRRef.current
      if (fillR) {
        const h = Math.round(Math.min(1, current.r) * TRACK_ACTIVE_HEIGHT)
        fillR.style.height = `${h}px`
        fillR.style.background =
          current.r > 0.9 ? 'var(--accent2)' : 'var(--accent1)'
      }

      rafId = requestAnimationFrame(animate)
    }

    rafId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId)
  }, [])

  const resetToDefault = useCallback(() => {
    dragRef.current = null
    setDragging(false)
    document.exitPointerLock()
    useStore.getState().stageHistory()
    setParam(moduleId, paramId, definition.default)
    useStore.getState().commitHistory()
  }, [definition.default, moduleId, paramId, setParam])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.detail === 2) {
        resetToDefault()
        return
      }
      useStore.getState().stageHistory()
      dragRef.current = { currentValue: value }
      setDragging(true)
      elRef.current?.requestPointerLock()
    },
    [resetToDefault, value],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return

      const sensitivity = e.shiftKey
        ? DRAG_SENSITIVITY * FINE_MULTIPLIER
        : DRAG_SENSITIVITY
      const delta = -e.movementY
      const newValue = Math.max(
        min,
        Math.min(
          max,
          dragRef.current.currentValue + delta * range * sensitivity,
        ),
      )
      dragRef.current.currentValue = newValue
      setParam(moduleId, paramId, newValue)
    },
    [max, min, moduleId, paramId, range, setParam],
  )

  const handlePointerUp = useCallback(() => {
    dragRef.current = null
    setDragging(false)
    document.exitPointerLock()
    useStore.getState().commitHistory()
  }, [])

  const toggleMute = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      useStore.getState().stageHistory()
      setParam(moduleId, muteParamId, muted ? 0 : 1)
      useStore.getState().commitHistory()
    },
    [moduleId, muteParamId, muted, setParam],
  )

  return (
    <div className={styles.root}>
      <div
        className={styles.control}
        ref={elRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDoubleClick={(e) => {
          e.stopPropagation()
          resetToDefault()
        }}
      >
        <div className={classes(styles.meterBar, styles.meterBarLeft)}>
          <div
            ref={fillLRef}
            className={styles.meterFill}
          />
        </div>
        <div className={classes(styles.meterBar, styles.meterBarRight)}>
          <div
            ref={fillRRef}
            className={styles.meterFill}
          />
        </div>

        <div
          className={classes(
            styles.thumbLine,
            (dragging || hovered) && styles.thumbActive,
          )}
          style={{ top: Math.round(thumbTop) }}
        />
        <div
          className={classes(
            styles.thumbHandle,
            (dragging || hovered) && styles.thumbActive,
          )}
          style={{ top: Math.round(thumbTop - 4) + 0.5 }}
        />
      </div>

      <div
        onPointerDown={toggleMute}
        onDoubleClick={(e) => e.stopPropagation()}
        className={styles.muteButton}
        data-muted={muted ? 'true' : 'false'}
      >
        {muted && (
          <div className={styles.muteOverlay} />
        )}
        <span className={styles.muteLabel}>m</span>
      </div>
    </div>
  )
}
