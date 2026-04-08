import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store'

interface PresetsModalProps {
  onClose: () => void
}

export function PresetsModal({ onClose }: PresetsModalProps) {
  const libraryPresets = useStore((s) => s.libraryPresets)
  const instantiateFromLibrary = useStore((s) => s.instantiateFromLibrary)
  const deleteLibraryPreset = useStore((s) => s.deleteLibraryPreset)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const allPresets = Object.values(libraryPresets)
  const filtered = query
    ? allPresets.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    : allPresets

  const maxIndex = Math.max(0, filtered.length - 1)
  const clamped = Math.min(selectedIndex, maxIndex)

  function handleInsert(presetId: string) {
    instantiateFromLibrary(presetId, { x: 2, y: 2 })
    onClose()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, maxIndex))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
        break
      case 'Enter': {
        e.preventDefault()
        const sel = filtered[clamped]
        if (sel) handleInsert(sel.id)
        break
      }
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 80,
      }}
      onMouseDown={onClose}
    >
      <div
        style={{
          background: 'var(--shade1)',
          border: '1px solid var(--shade2)',
          borderRadius: 4,
          width: 340,
          maxHeight: 400,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* search input */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--shade2)' }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0) }}
            onKeyDown={handleKeyDown}
            placeholder='search presets...'
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--shade3)',
              fontFamily: 'var(--font)',
              fontSize: 'var(--text-md)',
              textTransform: 'lowercase',
            }}
          />
        </div>

        {/* results */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 12, color: 'var(--shade2)', fontSize: 'var(--text-sm)', textAlign: 'center' }}>
              {allPresets.length === 0
                ? 'no saved presets yet — use save to library inside a subpatch view'
                : 'no presets match'}
            </div>
          ) : (
            filtered.map((preset, i) => (
              <div
                key={preset.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: i === clamped ? 'var(--accent0)' : 'transparent',
                  color: i === clamped ? 'var(--shade0)' : 'var(--shade3)',
                }}
              >
                <div
                  style={{ flex: 1, padding: '6px 12px', cursor: 'pointer', fontSize: 'var(--text-sm)' }}
                  onClick={() => handleInsert(preset.id)}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  {preset.name}
                </div>
                <div
                  style={{
                    padding: '6px 10px',
                    fontSize: 'var(--text-xs)',
                    cursor: 'pointer',
                    opacity: 0.6,
                    color: i === clamped ? 'var(--shade0)' : 'var(--shade2)',
                  }}
                  onClick={(e) => { e.stopPropagation(); deleteLibraryPreset(preset.id) }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.6' }}
                  title='delete preset'
                >
                  ✕
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
