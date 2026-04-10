import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store'
import styles from './PresetsModal.module.css'
import modalBaseStyles from '../styles/modalBase.module.css'

function classes(...tokens: Array<string | false | null | undefined>): string {
  return tokens.filter(Boolean).join(' ')
}

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
      className={classes(modalBaseStyles.overlayBase, styles.overlay)}
      onMouseDown={onClose}
    >
      <div
        className={classes(modalBaseStyles.modalBase, styles.modal)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* search input */}
        <div className={classes(modalBaseStyles.inputRowBase, styles.inputRow)}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0) }}
            onKeyDown={handleKeyDown}
            placeholder='search presets...'
            className={classes(modalBaseStyles.inputBase, styles.input)}
          />
        </div>

        {/* results */}
        <div className={classes(modalBaseStyles.resultsBase, styles.results)}>
          {filtered.length === 0 ? (
            <div className={classes(modalBaseStyles.emptyStateBase, styles.emptyState)}>
              {allPresets.length === 0
                ? 'no saved presets yet — use save to library inside a subpatch view'
                : 'no presets match'}
            </div>
          ) : (
            filtered.map((preset, i) => (
              <div
                key={preset.id}
                className={classes(styles.row, i === clamped && styles.rowSelected)}
              >
                <div
                  className={styles.rowMain}
                  onClick={() => handleInsert(preset.id)}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  {preset.name}
                </div>
                <div
                  className={classes(
                    styles.deleteButton,
                    i === clamped && styles.deleteButtonSelected,
                  )}
                  onClick={(e) => { e.stopPropagation(); deleteLibraryPreset(preset.id) }}
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
