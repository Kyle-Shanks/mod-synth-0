import { useState, useEffect, useRef } from 'react'
import styles from './TextInput.module.css'
import controlPrimitiveStyles from '../styles/controlPrimitives.module.css'

interface TextInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function TextInput({ value, onChange, placeholder }: TextInputProps) {
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  // sync draft when external value changes (e.g. after commit)
  useEffect(() => { setDraft(value) }, [value])

  function commit() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) onChange(trimmed)
    else setDraft(value)
  }

  return (
    <input
      ref={ref}
      className={`${controlPrimitiveStyles.panelInputBase} ${controlPrimitiveStyles.focusAccentBase} ${styles.input}`}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); ref.current?.blur() }
        if (e.key === 'Escape') { setDraft(value); ref.current?.blur() }
        e.stopPropagation()
      }}
      onMouseDown={(e) => e.stopPropagation()}
    />
  )
}
