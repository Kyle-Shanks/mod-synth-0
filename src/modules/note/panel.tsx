import { useEffect, useRef } from 'react'
import { useStore } from '../../store'
import styles from './panel.module.css'

interface NotePanelProps {
  moduleId: string
}

export function NotePanel({ moduleId }: NotePanelProps) {
  const mod = useStore((s) => s.modules[moduleId])
  const setModuleDataValue = useStore((s) => s.setModuleDataValue)
  const text = mod?.data?.text ?? ''
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const el = textareaRef.current
      if (!el) return
      if (document.activeElement !== el) return
      const target = event.target as Node | null
      if (target && !el.contains(target)) {
        el.blur()
      }
    }

    window.addEventListener('pointerdown', handlePointerDown, true)
    return () => window.removeEventListener('pointerdown', handlePointerDown, true)
  }, [])

  if (!mod) return null

  return (
    <div className={styles.root}>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setModuleDataValue(moduleId, 'text', e.target.value)}
        onMouseDown={(e) => e.stopPropagation()}
        placeholder='patch notes...'
        className={styles.textarea}
      />
    </div>
  )
}
