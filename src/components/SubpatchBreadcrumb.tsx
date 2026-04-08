import { useState } from 'react'
import { useStore } from '../store'
import { TextInput } from './TextInput'
import { computeContainerSize } from '../store/subpatchSlice'

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
    <div
      style={{
        position: 'sticky',
        top: 0,
        left: 0,
        zIndex: 10,
        height: 28,
        borderBottom: '1px solid var(--shade2)',
        background: 'var(--shade0)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 4,
        flexShrink: 0,
        fontSize: 'var(--text-xs)',
      }}
    >
      {/* breadcrumb navigation */}
      <span
        onClick={handleExitToRoot}
        style={{ color: 'var(--accent1)', cursor: 'pointer', opacity: 0.7 }}
        title='exit to root patch'
      >
        root
      </span>

      {subpatchContext.map((entry, i) => (
        <span
          key={entry.instanceId}
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <span style={{ color: 'var(--shade2)' }}>›</span>
          {i < subpatchContext.length - 1 ? (
            <span
              onClick={() => handleExitToLevel(i)}
              style={{
                color: 'var(--accent1)',
                cursor: 'pointer',
                opacity: 0.7,
              }}
            >
              {entry.name}
            </span>
          ) : (
            <span style={{ color: 'var(--shade3)', fontWeight: 600 }}>
              {entry.name}
            </span>
          )}
        </span>
      ))}

      {/* spacer */}
      <span style={{ flex: 1 }} />

      {/* settings for the current (deepest) subpatch */}
      <span style={{ color: 'var(--shade2)', marginRight: 4 }}>name</span>
      <div style={{ width: 80 }}>
        <TextInput
          value={currentDef?.name ?? ''}
          onChange={(v) => {
            updateDefinitionName(defId, v)
            syncAllInstances(defId)
          }}
          placeholder='name'
        />
      </div>

      <span style={{ color: 'var(--shade2)', marginLeft: 8, marginRight: 4 }}>
        w
      </span>
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
        style={{
          width: 40,
          background: 'var(--shade0)',
          border: '1px solid var(--shade2)',
          borderRadius: 2,
          color: 'var(--shade3)',
          fontFamily: 'var(--font)',
          fontSize: 'var(--text-xs)',
          textAlign: 'center',
          padding: '1px 2px',
          outline: 'none',
        }}
        onFocus={(e) => {
          ;(e.currentTarget as HTMLInputElement).style.borderColor =
            'var(--accent0)'
        }}
        onBlur={(e) => {
          ;(e.currentTarget as HTMLInputElement).style.borderColor =
            'var(--shade2)'
        }}
      />

      <span style={{ color: 'var(--shade2)', marginLeft: 4, marginRight: 4 }}>
        h
      </span>
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
        style={{
          width: 40,
          background: 'var(--shade0)',
          border: '1px solid var(--shade2)',
          borderRadius: 2,
          color: 'var(--shade3)',
          fontFamily: 'var(--font)',
          fontSize: 'var(--text-xs)',
          textAlign: 'center',
          padding: '1px 2px',
          outline: 'none',
        }}
        onFocus={(e) => {
          ;(e.currentTarget as HTMLInputElement).style.borderColor =
            'var(--accent0)'
        }}
        onBlur={(e) => {
          ;(e.currentTarget as HTMLInputElement).style.borderColor =
            'var(--shade2)'
        }}
      />

      <button
        className='topbar-button'
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
        style={{
          marginLeft: 8,
          border: 'none',
          fontFamily: 'var(--font)',
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          textTransform: 'lowercase',
          padding: '2px 4px',
          cursor: 'pointer',
          color: saved ? 'var(--accent0)' : undefined,
        }}
        title='save to library'
      >
        {saved ? 'saved!' : 'save to library'}
      </button>

      <span style={{ marginLeft: 8, color: 'var(--shade2)' }}>
        — esc to exit
      </span>
    </div>
  )
}
