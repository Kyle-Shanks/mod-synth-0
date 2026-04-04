import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store'
import { getAllModules } from '../modules/registry'
import type { ModuleDefinition } from '../engine/types'

const CATEGORY_ORDER = ['source', 'control', 'envelope', 'filter', 'dynamics', 'fx', 'utility', 'display'] as const

type DisplayItem =
  | { kind: 'header'; category: string }
  | { kind: 'module'; mod: ModuleDefinition; flatIndex: number }

export function CommandPalette() {
  const position = useStore((s) => s.commandPalettePosition)
  const setOpen = useStore((s) => s.setCommandPaletteOpen)
  const addModule = useStore((s) => s.addModule)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const allModules = getAllModules()

  // flat list of selectable modules (used for keyboard nav)
  const selectableModules: ModuleDefinition[] = query
    ? allModules
        .filter((m) => {
          const q = query.toLowerCase()
          return m.name.includes(q) || m.category.includes(q) || m.id.includes(q)
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    : CATEGORY_ORDER.flatMap((cat) =>
        allModules
          .filter((m) => m.category === cat)
          .sort((a, b) => a.name.localeCompare(b.name))
      )

  // display items — interleave category headers when not filtering
  const displayItems: DisplayItem[] = query
    ? selectableModules.map((mod, i) => ({ kind: 'module', mod, flatIndex: i }))
    : (() => {
        const items: DisplayItem[] = []
        let flatIndex = 0
        for (const cat of CATEGORY_ORDER) {
          const mods = allModules
            .filter((m) => m.category === cat)
            .sort((a, b) => a.name.localeCompare(b.name))
          if (mods.length === 0) continue
          items.push({ kind: 'header', category: cat })
          for (const mod of mods) {
            items.push({ kind: 'module', mod, flatIndex: flatIndex++ })
          }
        }
        return items
      })()

  // focus input on mount
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const maxIndex = Math.max(0, selectableModules.length - 1)
  const clampedSelectedIndex = Math.min(selectedIndex, maxIndex)

  function handleSelect(definitionId: string) {
    addModule(definitionId, position ?? { x: 2, y: 2 })
    setOpen(false)
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
        const sel = selectableModules[clampedSelectedIndex]
        if (sel) handleSelect(sel.id)
        break
      }
      case 'Escape':
        e.preventDefault()
        setOpen(false)
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
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
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
          {displayItems.map((item, i) =>
            item.kind === 'header' ? (
              <div
                key={`header-${item.category}`}
                style={{
                  padding: '4px 12px 2px',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--shade2)',
                  letterSpacing: '0.08em',
                  marginTop: i === 0 ? 0 : 4,
                }}
              >
                {item.category}
              </div>
            ) : (
              <div
                key={item.mod.id}
                onClick={() => handleSelect(item.mod.id)}
                style={{
                  padding: '6px 12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  background:
                    item.flatIndex === clampedSelectedIndex
                      ? 'var(--accent0)'
                      : 'transparent',
                  color:
                    item.flatIndex === clampedSelectedIndex
                      ? 'var(--shade0)'
                      : 'var(--shade3)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                <span>{item.mod.name}</span>
              </div>
            ),
          )}
          {selectableModules.length === 0 && (
            <div
              style={{
                padding: '12px',
                color: 'var(--shade2)',
                fontSize: 'var(--text-sm)',
                textAlign: 'center',
              }}
            >
              no modules found
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
