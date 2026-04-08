import { useRef, useState, useCallback, useEffect } from 'react'
import type { ParamDefinition } from '../engine/types'
import { useStore } from '../store'
import { internalWorkletId } from '../store/subpatchSlice'

const DRAG_SENSITIVITY = 0.004
const FINE_MULTIPLIER = 0.1
const ATTACK = 0.9
const RELEASE = 0.18
const STRIP_WIDTH = 24
const STRIP_HEIGHT = 76
const STRIP_LEFT = 10
const ACTIVE_TOP = 1
const ACTIVE_BOTTOM = 1
const TICK_COUNT = 6

interface MixerInputStripProps {
  moduleId: string
  paramId: string
  definition: ParamDefinition
  value: number
  meterLeftId: string
  meterRightId: string
  label: string
}

export function MixerInputStrip({
  moduleId,
  paramId,
  definition,
  value,
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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        minWidth: 32,
      }}
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
        style={{
          position: 'relative',
          width: STRIP_WIDTH + STRIP_LEFT,
          height: STRIP_HEIGHT,
          cursor: 'ns-resize',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: STRIP_LEFT,
            width: STRIP_WIDTH,
            height: STRIP_HEIGHT,
            background: 'var(--shade0)',
            border: '1px solid var(--shade2)',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            ref={meterFillLRef}
            style={{
              position: 'absolute',
              left: 0,
              width: '50%',
              bottom: ACTIVE_BOTTOM,
              height: 0,
              background: 'var(--accent1)',
            }}
          />
          <div
            ref={meterFillRRef}
            style={{
              position: 'absolute',
              right: 0,
              width: '50%',
              bottom: ACTIVE_BOTTOM,
              height: 0,
              background: 'var(--accent1)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: '50%',
              width: 1,
              background: 'var(--shade2)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: ACTIVE_BOTTOM + Math.round(0.9 * activeHeight),
              height: 1,
              background: 'var(--accent2)',
              opacity: 0.4,
            }}
          />
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
              style={{
                position: 'absolute',
                left: STRIP_LEFT,
                top: y,
                width: 4,
                height: 1,
                background: 'var(--shade2)',
                opacity: 0.8,
              }}
            />
          )
        })}

        <div
          style={{
            position: 'absolute',
            left: STRIP_LEFT,
            right: 0,
            top: Math.round(controlY),
            height: 1,
            background:
              dragging || hovered ? 'var(--accent0)' : 'var(--shade3)',
            transition: 'background 100ms',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: STRIP_LEFT - 7,
            top: Math.round(controlY - 4) + 0.5,
            width: 8,
            height: 8,
            background:
              dragging || hovered ? 'var(--accent0)' : 'var(--shade3)',
            clipPath: 'polygon(0 15%, 72% 15%, 100% 50%, 72% 85%, 0 85%)',
            transition: 'background 100ms',
          }}
        />
      </div>

      <div
        style={{
          width: 18,
          height: 18,
          marginLeft: STRIP_LEFT / 2,
          borderRadius: 3,
          border: '1px solid var(--shade2)',
          color: 'var(--shade3)',
          fontSize: 'var(--text-xs)',
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--shade1)',
        }}
      >
        {label}
      </div>
    </div>
  )
}
