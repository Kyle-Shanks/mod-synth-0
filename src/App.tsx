import { useEffect, useState, useRef, useCallback } from 'react'
import { ThemeProvider } from './theme/ThemeProvider'
import { Rack } from './rack/Rack'
import { CommandPalette } from './components/CommandPalette'
import { SettingsPanel } from './components/SettingsPanel'
import { engine } from './engine/EngineController'
import { useStore } from './store'
import {
  restoreSavedPatch,
  setupAutosave,
  clearPatchStorage,
} from './persistence/storage'
import {
  serializePatch,
  deserializePatch,
  validatePatchJson,
} from './persistence/serialization'
import './modules/registry' // ensure modules are registered

export default function App() {
  const [started, setStarted] = useState(false)
  const setEngineReady = useStore((s) => s.setEngineReady)
  const setSettingsPanelOpen = useStore((s) => s.setSettingsPanelOpen)
  const patchName = useStore((s) => s.patchName)
  const setPatchName = useStore((s) => s.setPatchName)
  const clearPatch = useStore((s) => s.clearPatch)
  const loadPatch = useStore((s) => s.loadPatch)
  const setCableTautness = useStore((s) => s.setCableTautness)
  const setTooltipsEnabled = useStore((s) => s.setTooltipsEnabled)
  const setTheme = useStore((s) => s.setTheme)
  // const undo = useStore((s) => s.undo)
  // const redo = useStore((s) => s.redo)
  const pastLength = useStore((s) => s.past.length)
  const futureLength = useStore((s) => s.future.length)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')

  useEffect(() => {
    engine.initialize().then(() => {
      setEngineReady(true)
      restoreSavedPatch()
    })
  }, [setEngineReady])

  // subscribe to meter events from worklet and forward to store
  const setMeterValue = useStore((s) => s.setMeterValue)
  useEffect(() => {
    return engine.onEvent((event) => {
      if (event.type === 'METER') {
        setMeterValue(`${event.moduleId}:${event.portId}`, event.peak)
      }
    })
  }, [setMeterValue])

  // autosave subscription
  useEffect(() => {
    return setupAutosave()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      const isMac = navigator.platform.toUpperCase().includes('MAC')
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (mod && !e.shiftKey && e.key === 'z') {
        e.preventDefault()
        useStore.getState().undo()
      }
      if (mod && e.shiftKey && e.key === 'z') {
        e.preventDefault()
        useStore.getState().redo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  async function handleStart() {
    await engine.resume()
    setStarted(true)
  }

  const handleNewPatch = useCallback(() => {
    if (Object.keys(useStore.getState().modules).length === 0) return
    if (!window.confirm('clear current patch? unsaved changes will be lost.'))
      return
    clearPatch()
    clearPatchStorage()
  }, [clearPatch])

  const handleExport = useCallback(() => {
    const state = useStore.getState()
    const patch = serializePatch(state)
    const blob = new Blob([JSON.stringify(patch, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${state.patchName.replace(/\s+/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const handleImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const data: unknown = JSON.parse(reader.result as string)
          if (!validatePatchJson(data)) {
            alert('invalid patch file.')
            return
          }
          const { name, modules, cables, settings } = deserializePatch(data)
          loadPatch(name, modules, cables)
          setCableTautness(settings.cableTautness)
          setTooltipsEnabled(settings.tooltipsEnabled)
          setTheme(settings.themeId)
        } catch {
          alert('failed to parse patch file.')
        }
      }
      reader.readAsText(file)
      // reset file input so re-importing the same file works
      e.target.value = ''
    },
    [loadPatch, setCableTautness, setTooltipsEnabled, setTheme],
  )

  const handleNameClick = useCallback(() => {
    setNameInput(patchName)
    setEditingName(true)
  }, [patchName])

  const handleNameCommit = useCallback(() => {
    const trimmed = nameInput.trim()
    if (trimmed) setPatchName(trimmed)
    setEditingName(false)
  }, [nameInput, setPatchName])

  const topBarBtnStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    color: 'var(--shade3)',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    textTransform: 'lowercase',
    padding: '2px 4px',
  }

  return (
    <ThemeProvider>
      {!started ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <button
            onClick={handleStart}
            style={{
              fontSize: 'var(--text-lg)',
              padding: '16px 40px',
              cursor: 'pointer',
              background: 'var(--accent0)',
              color: 'var(--shade0)',
              border: 'none',
              borderRadius: 4,
              fontFamily: 'var(--font)',
              fontWeight: 600,
              textTransform: 'lowercase',
              letterSpacing: 1,
            }}
          >
            start
          </button>
        </div>
      ) : (
        <>
          {/* top bar */}
          <div
            style={{
              height: 36,
              borderBottom: '1px solid var(--shade2)',
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
              gap: 12,
              flexShrink: 0,
              background: 'var(--shade1)',
            }}
          >
            {/* patch name — click to edit */}
            {editingName ? (
              <input
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={handleNameCommit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNameCommit()
                  if (e.key === 'Escape') setEditingName(false)
                }}
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--shade3)',
                  fontWeight: 600,
                  fontFamily: 'var(--font)',
                  textTransform: 'lowercase',
                  background: 'var(--shade0)',
                  border: '1px solid var(--accent0)',
                  borderRadius: 2,
                  padding: '1px 4px',
                  outline: 'none',
                  width: 160,
                }}
              />
            ) : (
              <span
                onClick={handleNameClick}
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--shade3)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                title='click to rename'
              >
                {patchName}
              </span>
            )}

            {/* separator dot */}
            <span
              style={{ fontSize: 'var(--text-xs)', color: 'var(--shade2)' }}
            >
              ·
            </span>

            {/* new */}
            <button
              onClick={handleNewPatch}
              style={topBarBtnStyle}
              title='new patch'
            >
              new
            </button>

            {/* separator dot */}
            <span
              style={{ fontSize: 'var(--text-xs)', color: 'var(--shade2)' }}
            >
              ·
            </span>

            {/* export */}
            <button
              onClick={handleExport}
              style={topBarBtnStyle}
              title='export patch as json'
            >
              export
            </button>

            {/* import */}
            <button
              onClick={() => fileInputRef.current?.click()}
              style={topBarBtnStyle}
              title='import patch from json'
            >
              import
            </button>
            <input
              ref={fileInputRef}
              type='file'
              accept='.json'
              style={{ display: 'none' }}
              onChange={handleImport}
            />

            {/* separator dot */}
            <span
              style={{ fontSize: 'var(--text-xs)', color: 'var(--shade2)' }}
            >
              ·
            </span>

            {/* undo */}
            <button
              onClick={() => useStore.getState().undo()}
              disabled={pastLength === 0}
              style={{
                ...topBarBtnStyle,
                fontSize: 'var(--text-m)',
                opacity: pastLength === 0 ? 0.3 : 1,
              }}
              title='undo (cmd+z)'
            >
              ↩
            </button>

            {/* redo */}
            <button
              onClick={() => useStore.getState().redo()}
              disabled={futureLength === 0}
              style={{
                ...topBarBtnStyle,
                fontSize: 'var(--text-m)',
                opacity: futureLength === 0 ? 0.3 : 1,
              }}
              title='redo (cmd+shift+z)'
            >
              ↪
            </button>

            {/* spacer */}
            <div style={{ flex: 1 }} />

            {/* hint */}
            <span
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--shade2)',
              }}
            >
              space / right-click to add modules
            </span>

            {/* settings gear */}
            <button
              onClick={() => setSettingsPanelOpen(true)}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: 'var(--text-md)',
                color: 'var(--shade2)',
                cursor: 'pointer',
                padding: '2px 4px',
                lineHeight: 1,
              }}
              title='settings'
            >
              &#9881;
            </button>
          </div>

          <Rack />
          <CommandPalette />
          <SettingsPanel />
        </>
      )}
    </ThemeProvider>
  )
}
