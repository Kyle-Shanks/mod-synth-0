import { useState, useRef, useEffect, useCallback } from 'react'
import { useStore } from '../store'
import { getAllModules } from '../modules/registry'

export function CommandPalette() {
  const open = useStore((s) => s.commandPaletteOpen)
  const position = useStore((s) => s.commandPalettePosition)
  const setOpen = useStore((s) => s.setCommandPaletteOpen)
  const addModule = useStore((s) => s.addModule)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const allModules = getAllModules()
  const filtered = query
    ? allModules.filter((m) => {
        const q = query.toLowerCase()
        return m.name.includes(q) || m.category.includes(q) || m.id.includes(q)
      })
    : allModules

  // focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      // small delay for DOM to render
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // clamp selection
  useEffect(() => {
    if (selectedIndex >= filtered.length) setSelectedIndex(Math.max(0, filtered.length - 1))
  }, [filtered.length, selectedIndex])

  const handleSelect = useCallback((definitionId: string) => {
    addModule(definitionId, position ?? { x: 2, y: 2 })
    setOpen(false)
  }, [addModule, position, setOpen])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
        break
      case 'Enter': {
        e.preventDefault()
        const sel = filtered[selectedIndex]
        if (sel) handleSelect(sel.id)
        break
      }
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        break
    }
  }, [filtered, selectedIndex, handleSelect, setOpen])

  if (!open) return null

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
      onMouseDown={() => setOpen(false)}
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
        {/* input */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--shade2)' }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0) }}
            onKeyDown={handleKeyDown}
            placeholder="add module..."
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
          {filtered.map((mod, i) => (
            <div
              key={mod.id}
              onClick={() => handleSelect(mod.id)}
              style={{
                padding: '6px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                background: i === selectedIndex ? 'var(--accent0)' : 'transparent',
                color: i === selectedIndex ? 'var(--shade0)' : 'var(--shade3)',
                fontSize: 'var(--text-sm)',
              }}
            >
              <span>{mod.name}</span>
              <span style={{
                fontSize: 'var(--text-xs)',
                opacity: 0.6,
              }}>
                {mod.category}
              </span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: '12px', color: 'var(--shade2)', fontSize: 'var(--text-sm)', textAlign: 'center' }}>
              no modules found
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
