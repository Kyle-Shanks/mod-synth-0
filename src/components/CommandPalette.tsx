import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store'
import { getAllModules } from '../modules/registry'
import type { ModuleDefinition } from '../engine/types'
import styles from './CommandPalette.module.css'

function classes(...tokens: Array<string | false | null | undefined>): string {
  return tokens.filter(Boolean).join(' ')
}

// synthetic "add subpatch container" entry shown only at root level
const SUBPATCH_ENTRY: ModuleDefinition = {
  id: '__add_subpatch__',
  name: 'subpatch',
  category: 'subpatch',
  width: 4,
  height: 3,
  inputs: {},
  outputs: {},
  params: {},
  initialize: () => ({}),
  process: () => {},
}

const CATEGORY_ORDER = [
  'subpatch',
  'source',
  'control',
  'envelope',
  'filter',
  'dynamics',
  'fx',
  'utility',
  'display',
] as const

type DisplayItem =
  | { kind: 'header'; category: string }
  | { kind: 'module'; mod: ModuleDefinition; flatIndex: number }

export function CommandPalette() {
  const position = useStore((s) => s.commandPalettePosition)
  const setOpen = useStore((s) => s.setCommandPaletteOpen)
  const addModule = useStore((s) => s.addModule)
  const createDefinition = useStore((s) => s.createDefinition)
  const addSubpatchContainer = useStore((s) => s.addSubpatchContainer)
  const subpatchContext = useStore((s) => s.subpatchContext)
  const isInsideSubpatch = subpatchContext.length > 0
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // filter module list: hide internal modules at root; show them only inside a subpatch
  // at root, add synthetic 'subpatch' entry
  const allModules = getAllModules()
    .filter((m) => {
      if (m.internal) return isInsideSubpatch
      return true
    })
    .concat(isInsideSubpatch ? [] : [SUBPATCH_ENTRY])

  // flat list of selectable modules (used for keyboard nav)
  const selectableModules: ModuleDefinition[] = query
    ? allModules
        .filter((m) => {
          const q = query.toLowerCase()
          return (
            m.name.includes(q) || m.category.includes(q) || m.id.includes(q)
          )
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    : CATEGORY_ORDER.flatMap((cat) =>
        allModules
          .filter((m) => m.category === cat)
          .sort((a, b) => a.name.localeCompare(b.name)),
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
    const pos = position ?? { x: 2, y: 2 }
    if (definitionId === '__add_subpatch__') {
      const defId = createDefinition('untitled')
      addSubpatchContainer(defId, pos)
    } else {
      addModule(definitionId, pos)
    }
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
    <div className={styles.overlay} onMouseDown={() => setOpen(false)}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        {/* input */}
        <div className={styles.inputRow}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder='add module...'
            className={styles.input}
          />
        </div>

        {/* results */}
        <div className={styles.results}>
          {displayItems.map((item, i) =>
            item.kind === 'header' ? (
              <div
                key={`header-${item.category}`}
                className={classes(
                  styles.categoryHeader,
                  i !== 0 && styles.categoryHeaderWithMargin,
                )}
              >
                {item.category}
              </div>
            ) : (
              <div
                key={item.mod.id}
                onClick={() => handleSelect(item.mod.id)}
                className={classes(
                  styles.moduleRow,
                  item.flatIndex === clampedSelectedIndex &&
                    styles.moduleRowActive,
                )}
              >
                <span>{item.mod.name}</span>
              </div>
            ),
          )}
          {selectableModules.length === 0 && (
            <div className={styles.emptyState}>no modules found</div>
          )}
        </div>
      </div>
    </div>
  )
}
