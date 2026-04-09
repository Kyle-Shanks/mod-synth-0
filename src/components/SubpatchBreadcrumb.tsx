import { useState } from 'react'
import { useStore } from '../store'
import { TextInput } from './TextInput'
import { computeContainerSize } from '../store/subpatchSlice'
import styles from './SubpatchBreadcrumb.module.css'

function classes(...tokens: Array<string | false | null | undefined>): string {
  return tokens.filter(Boolean).join(' ')
}

// TextInput is kept for the name field

export function SubpatchBreadcrumb() {
  const subpatchContext = useStore((s) => s.subpatchContext)
  const exitToRoot = useStore((s) => s.exitToRoot)
  const exitSubpatch = useStore((s) => s.exitSubpatch)
  const syncAllInstances = useStore((s) => s.syncAllInstances)
  const updateDefinitionName = useStore((s) => s.updateDefinitionName)
  const updateDefinitionSize = useStore((s) => s.updateDefinitionSize)
  const saveDefinitionToLibrary = useStore((s) => s.saveDefinitionToLibrary)
  const libraryPresets = useStore((s) => s.libraryPresets)
  const [saved, setSaved] = useState(false)

  const currentEntry = subpatchContext[subpatchContext.length - 1]
  const currentDef = useStore((s) =>
    currentEntry ? s.definitions[currentEntry.definitionId] : undefined,
  )

  if (subpatchContext.length === 0) return null

  const defId = currentEntry!.definitionId
  const autoSize = currentDef
    ? computeContainerSize({
        ...currentDef,
        widthOverride: undefined,
        heightOverride: undefined,
      })
    : { width: 4, height: 3 }
  const currentW = currentDef?.widthOverride ?? autoSize.width
  const currentH = currentDef?.heightOverride ?? autoSize.height

  function handleExitToRoot() {
    syncAllInstances(defId)
    exitToRoot()
  }

  function handleExitToLevel(index: number) {
    syncAllInstances(defId)
    const targetLength = index + 1
    const timesToPop = subpatchContext.length - targetLength
    for (let i = 0; i < timesToPop; i++) exitSubpatch()
  }

  function handleSizeChange(axis: 'w' | 'h', raw: string) {
    const v = parseInt(raw, 10)
    if (isNaN(v) || v < 2) return
    const w = axis === 'w' ? v : currentW
    const h = axis === 'h' ? v : currentH
    updateDefinitionSize(defId, w, h)
    syncAllInstances(defId)
  }

  return (
    <div className={styles.bar}>
      {/* breadcrumb navigation */}
      <span
        onClick={handleExitToRoot}
        className={styles.rootLink}
        title='exit to root patch'
      >
        root
      </span>

      {subpatchContext.map((entry, i) => (
        <span key={entry.instanceId} className={styles.crumbGroup}>
          <span className={styles.separator}>›</span>
          {i < subpatchContext.length - 1 ? (
            <span
              onClick={() => handleExitToLevel(i)}
              className={styles.crumbLink}
            >
              {entry.name}
            </span>
          ) : (
            <span className={styles.crumbCurrent}>{entry.name}</span>
          )}
        </span>
      ))}

      {/* spacer */}
      <span className={styles.spacer} />

      {/* settings for the current (deepest) subpatch */}
      <span className={classes(styles.label, styles.labelName)}>name</span>
      <div className={styles.nameInputWrap}>
        <TextInput
          value={currentDef?.name ?? ''}
          onChange={(v) => {
            updateDefinitionName(defId, v)
            syncAllInstances(defId)
          }}
          placeholder='name'
        />
      </div>

      <span className={classes(styles.label, styles.labelW)}>w</span>
      <input
        type='number'
        min={2}
        step={1}
        value={currentW}
        onChange={(e) => handleSizeChange('w', e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape')
            (e.currentTarget as HTMLInputElement).blur()
          e.stopPropagation()
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className={styles.numberInput}
      />

      <span className={classes(styles.label, styles.labelH)}>h</span>
      <input
        type='number'
        min={2}
        step={1}
        value={currentH}
        onChange={(e) => handleSizeChange('h', e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape')
            (e.currentTarget as HTMLInputElement).blur()
          e.stopPropagation()
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className={styles.numberInput}
      />

      <button
        className={classes(
          styles.saveButton,
          saved && styles.saveButtonSaved,
        )}
        onClick={() => {
          const name = currentDef?.name ?? ''
          const conflict = Object.values(libraryPresets).find(
            (p) => p.name === name && p.id !== defId,
          )
          if (conflict && !window.confirm(`overwrite preset "${name}"?`)) return
          saveDefinitionToLibrary(defId)
          setSaved(true)
          setTimeout(() => setSaved(false), 1500)
        }}
        title='save to library'
      >
        {saved ? 'saved!' : 'save to library'}
      </button>

      <span className={styles.exitHint}>— esc to exit</span>
    </div>
  )
}
