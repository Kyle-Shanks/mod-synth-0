import { useCallback, type PointerEvent } from 'react'
import { ModuleSquareButton } from '../../components/ModuleSquareButton'
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
    (e: PointerEvent<HTMLDivElement>) => {
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
      <ModuleSquareButton
        pressed={muted}
        variant='mute'
        showOverlayWhenPressed
        ariaLabel='mute'
        onPointerDown={toggleMute}
      />
    </div>
  )
}
