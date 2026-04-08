import { useCallback } from 'react'
import { useStore } from '../../store'

interface MutePanelProps {
  moduleId: string
}

export function MutePanel({ moduleId }: MutePanelProps) {
  const mod = useStore((s) => s.modules[moduleId])
  const setParam = useStore((s) => s.setParam)
  const muted = (mod?.params.mute ?? 0) >= 0.5

  const toggleMute = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      useStore.getState().stageHistory()
      setParam(moduleId, 'mute', muted ? 0 : 1)
      useStore.getState().commitHistory()
    },
    [moduleId, muted, setParam],
  )

  if (!mod) return null

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onPointerDown={toggleMute}
        style={{
          width: 40,
          height: 40,
          border: `1.5px solid ${muted ? 'var(--accent3)' : 'var(--shade2)'}`,
          borderRadius: 4,
          background: 'var(--shade1)',
          position: 'relative',
          overflow: 'hidden',
          cursor: 'pointer',
          transition: 'border-color 80ms',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {muted && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'var(--accent3)',
              opacity: 0.2,
              pointerEvents: 'none',
            }}
          />
        )}
        {muted && (
          <div
            style={{
              position: 'relative',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--accent3)',
              opacity: 0.9,
            }}
          />
        )}
      </div>
    </div>
  )
}
