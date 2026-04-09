import { useCallback } from 'react'
import { useStore } from '../../store'
import styles from './panel.module.css'

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
    <div className={styles.root}>
      <div
        onPointerDown={toggleMute}
        className={styles.button}
        data-muted={muted ? 'true' : 'false'}
      >
        {muted && (
          <div className={styles.overlay} />
        )}
        {muted && (
          <div className={styles.dot} />
        )}
      </div>
    </div>
  )
}
