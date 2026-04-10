import { useRef, useState, useCallback, useEffect } from 'react'
import type { ParamDefinition } from '../engine/types'
import { useStore } from '../store'
import { internalWorkletId } from '../store/subpatchSlice'
import styles from './MixerInputStrip.module.css'
import mixerBaseStyles from '../styles/mixerControlBase.module.css'

const DRAG_SENSITIVITY = 0.004
const FINE_MULTIPLIER = 0.1
const ATTACK = 0.9
const RELEASE = 0.18
const STRIP_HEIGHT = 76
const ACTIVE_TOP = 1
const ACTIVE_BOTTOM = 1
const TICK_COUNT = 6

interface MixerInputStripProps {
  moduleId: string
  paramId: string
  definition: ParamDefinition
  value: number
  muteParamId: string
  muted: boolean
  meterLeftId: string
  meterRightId: string
  label: string
}

function classes(...tokens: Array<string | false | null | undefined>): string {
  return tokens.filter(Boolean).join(' ')
}

export function MixerInputStrip({
  moduleId,
  paramId,
  definition,
  value,
  muteParamId,
  muted,
  meterLeftId,
  meterRightId,
  label,
}: MixerInputStripProps) {
  const setParam = useStore((s) => s.setParam)
  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ currentValue: number } | null>(null)
  const elRef = useRef<HTMLDivElement>(null)

  const meterFillLRef = useRef<HTMLDivElement | null>(null)
  const meterFillRRef = useRef<HTMLDivElement | null>(null)
  const meterTargetRef = useRef({ l: 0, r: 0 })
  const meterDisplayRef = useRef({ l: 0, r: 0 })

  const min = definition.min ?? 0
  const max = definition.max ?? 1
  const range = max - min
  const normalized = range > 0 ? (value - min) / range : 0
  const activeHeight = STRIP_HEIGHT - ACTIVE_TOP - ACTIVE_BOTTOM
  const controlY = ACTIVE_TOP + (1 - normalized) * Math.max(0, activeHeight - 1)

  useEffect(() => {
    return useStore.subscribe((state) => {
      const ctx = state.subpatchContext
      const instanceId = ctx[ctx.length - 1]?.instanceId
      const workletId = instanceId
        ? internalWorkletId(instanceId, moduleId)
        : moduleId
      meterTargetRef.current.l =
        state.meterValues[`${workletId}:${meterLeftId}`] ?? 0
      meterTargetRef.current.r =
        state.meterValues[`${workletId}:${meterRightId}`] ?? 0
    })
  }, [moduleId, meterLeftId, meterRightId])

  useEffect(() => {
    let rafId: number

    const animate = () => {
      const target = meterTargetRef.current
      const current = meterDisplayRef.current

      current.l +=
        (target.l - current.l) * (target.l > current.l ? ATTACK : RELEASE)
      current.r +=
        (target.r - current.r) * (target.r > current.r ? ATTACK : RELEASE)

      const fillL = meterFillLRef.current
      if (fillL) {
        const h = Math.round(Math.min(1, current.l) * activeHeight)
        fillL.style.height = `${h}px`
        fillL.style.background =
          current.l > 0.9 ? 'var(--accent2)' : 'var(--accent1)'
      }

      const fillR = meterFillRRef.current
      if (fillR) {
        const h = Math.round(Math.min(1, current.r) * activeHeight)
        fillR.style.height = `${h}px`
        fillR.style.background =
          current.r > 0.9 ? 'var(--accent2)' : 'var(--accent1)'
      }

      rafId = requestAnimationFrame(animate)
    }

    rafId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId)
  }, [activeHeight])

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
    [min, max, moduleId, paramId, range, setParam],
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
    <div
      className={classes(mixerBaseStyles.rootBase, styles.root)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={(e) => {
        e.stopPropagation()
        resetToDefault()
      }}
    >
      <div
        ref={elRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={classes(mixerBaseStyles.controlBase, styles.control)}
      >
        <div className={styles.track}>
          <div
            ref={meterFillLRef}
            className={styles.meterFillLeft}
          />
          <div
            ref={meterFillRRef}
            className={styles.meterFillRight}
          />
          <div className={styles.trackCenterLine} />
          <div className={styles.clipLine} />
        </div>

        {Array.from({ length: Math.max(0, TICK_COUNT - 2) }).map((_, idx) => {
          const tickIdx = idx + 1
          const y =
            ACTIVE_TOP +
            (tickIdx / Math.max(1, TICK_COUNT - 1)) *
              Math.max(0, activeHeight - 1)
          return (
            <div
              key={tickIdx}
              className={styles.tick}
              style={{ top: y }}
            />
          )
        })}

        <div
          className={classes(
            mixerBaseStyles.thumbLineBase,
            styles.thumbLine,
            (dragging || hovered) && mixerBaseStyles.thumbActiveBase,
            (dragging || hovered) && styles.thumbActive,
          )}
          style={{ top: Math.round(controlY) }}
        />
        <div
          className={classes(
            mixerBaseStyles.thumbHandleBase,
            styles.thumbHandle,
            (dragging || hovered) && mixerBaseStyles.thumbActiveBase,
            (dragging || hovered) && styles.thumbActive,
          )}
          style={{ top: Math.round(controlY - 4) + 0.5 }}
        />
      </div>

      <div
        onPointerDown={toggleMute}
        onDoubleClick={(e) => e.stopPropagation()}
        className={classes(mixerBaseStyles.muteButtonBase, styles.muteButton)}
        data-muted={muted ? 'true' : 'false'}
      >
        {muted && (
          <div className={classes(mixerBaseStyles.muteOverlayBase, styles.muteOverlay)} />
        )}
        <span className={classes(mixerBaseStyles.muteLabelBase, styles.muteLabel)}>
          {label}
        </span>
      </div>
    </div>
  )
}
