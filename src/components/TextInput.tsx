import { useState, useEffect, useRef } from 'react'

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
      style={{
        width: '100%',
        background: 'var(--shade0)',
        border: '1px solid var(--shade2)',
        borderRadius: 2,
        color: 'var(--shade3)',
        fontFamily: 'var(--font)',
        fontSize: 'var(--text-xs)',
        textAlign: 'center',
        padding: '2px 4px',
        outline: 'none',
        boxSizing: 'border-box',
        transition: 'border-color 80ms',
      }}
      onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--accent0)' }}
      onBlurCapture={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--shade2)' }}
    />
  )
}
