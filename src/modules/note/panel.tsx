import { useEffect, useRef } from 'react'
import { useStore } from '../../store'

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
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: 6,
      }}
    >
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setModuleDataValue(moduleId, 'text', e.target.value)}
        onMouseDown={(e) => e.stopPropagation()}
        placeholder='patch notes...'
        style={{
          flex: 1,
          resize: 'none',
          border: '1px solid var(--shade2)',
          borderRadius: 2,
          background: 'var(--shade0)',
          color: 'var(--shade3)',
          fontFamily: 'var(--font)',
          fontSize: 'var(--text-xs)',
          lineHeight: 1.4,
          padding: 6,
          outline: 'none',
        }}
      />
    </div>
  )
}
