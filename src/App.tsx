import { useEffect, useState, useRef, useCallback } from 'react'
import { ThemeProvider } from './theme/ThemeProvider'
import { Rack } from './rack/Rack'
import { CommandPalette } from './components/CommandPalette'
import { PresetsModal } from './components/PresetsModal'
import { SettingsPanel } from './components/SettingsPanel'
import { TutorialOverlay } from './components/TutorialOverlay'
import { engine } from './engine/EngineController'
import { useStore } from './store'
import { classes } from './utils/classes'
import {
  restoreSavedPatch,
  setupAutosave,
  clearPatchStorage,
} from './persistence/storage'
import { loadLibraryFromStorage } from './store/subpatchSlice'
import {
  serializePatch,
  deserializePatch,
  validatePatchJson,
} from './persistence/serialization'
import { getTheme } from './theme/themeRegistry'
import './modules/registry' // ensure modules are registered
import styles from './App.module.css'
import controlPrimitiveStyles from './styles/controlPrimitives.module.css'

export default function App() {
  const [started, setStarted] = useState(false)
  const setEngineReady = useStore((s) => s.setEngineReady)
  const settingsPanelOpen = useStore((s) => s.settingsPanelOpen)
  const setSettingsPanelOpen = useStore((s) => s.setSettingsPanelOpen)
  const patchName = useStore((s) => s.patchName)
  const setPatchName = useStore((s) => s.setPatchName)
  const clearPatch = useStore((s) => s.clearPatch)
  const loadPatch = useStore((s) => s.loadPatch)
  const tutorialPanelOpen = useStore((s) => s.tutorialPanelOpen)
  const setTutorialPanelOpen = useStore((s) => s.setTutorialPanelOpen)
  const setCableTautness = useStore((s) => s.setCableTautness)
  const setTooltipsEnabled = useStore((s) => s.setTooltipsEnabled)
  const themeId = useStore((s) => s.themeId)
  const setTheme = useStore((s) => s.setTheme)
  const zoom = useStore((s) => s.zoom)
  const setZoom = useStore((s) => s.setZoom)
  const commandPaletteOpen = useStore((s) => s.commandPaletteOpen)
  // const undo = useStore((s) => s.undo)
  // const redo = useStore((s) => s.redo)
  const pastLength = useStore((s) =>
    s.subpatchContext.length > 0 ? 0 : s.past.length,
  )
  const futureLength = useStore((s) =>
    s.subpatchContext.length > 0 ? 0 : s.future.length,
  )
  const fileInputRef = useRef<HTMLInputElement>(null)
  const initStartedRef = useRef(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [presetsOpen, setPresetsOpen] = useState(false)
  const subpatchContext = useStore((s) => s.subpatchContext)
  const isInsideSubpatch = subpatchContext.length > 0

  useEffect(() => {
    if (initStartedRef.current) return
    initStartedRef.current = true
    engine.initialize().then(() => {
      setEngineReady(true)
      // load library presets before restoring the patch
      const savedLibrary = loadLibraryFromStorage()
      if (Object.keys(savedLibrary).length > 0) {
        useStore.setState({ libraryPresets: savedLibrary })
      }
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
    if (
      Object.keys(useStore.getState().modules).length > 0 &&
      !window.confirm('clear current patch? unsaved changes will be lost.')
    ) {
      return
    }
    useStore.getState().exitToRoot()
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
          const { name, modules, cables, definitions, settings } =
            deserializePatch(data)
          loadPatch(name, modules, cables, definitions)
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

  return (
    <ThemeProvider theme={getTheme(themeId)}>
      {!started ? (
        <div className={styles.startScreen}>
          <button
            onClick={handleStart}
            className={classes(
              controlPrimitiveStyles.buttonBase,
              controlPrimitiveStyles.buttonPrimary,
              styles.startButton,
            )}
          >
            start
          </button>
        </div>
      ) : (
        <>
          {/* top bar */}
          <div className={styles.topBar}>
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
                className={classes(
                  controlPrimitiveStyles.panelInputBase,
                  styles.patchNameInput,
                )}
              />
            ) : (
              <span
                onClick={handleNameClick}
                className={styles.patchNameDisplay}
                title='click to rename'
              >
                {patchName}
              </span>
            )}

            {/* separator dot */}
            <span className={styles.separator}>·</span>

            {/* new */}
            <button
              className={classes(
                controlPrimitiveStyles.buttonBase,
                controlPrimitiveStyles.buttonTertiary,
                styles.topbarButton,
              )}
              onClick={handleNewPatch}
              title='new patch'
            >
              new
            </button>

            {/* separator dot */}
            <span className={styles.separator}>·</span>

            {/* export */}
            <button
              className={classes(
                controlPrimitiveStyles.buttonBase,
                controlPrimitiveStyles.buttonTertiary,
                styles.topbarButton,
              )}
              onClick={handleExport}
              title='export patch as json'
            >
              export
            </button>

            {/* import */}
            <button
              className={classes(
                controlPrimitiveStyles.buttonBase,
                controlPrimitiveStyles.buttonTertiary,
                styles.topbarButton,
              )}
              onClick={() => fileInputRef.current?.click()}
              title='import patch from json'
            >
              import
            </button>
            <input
              ref={fileInputRef}
              type='file'
              accept='.json'
              className={styles.hiddenFileInput}
              onChange={handleImport}
            />

            {/* presets — hidden when inside a subpatch */}
            {!isInsideSubpatch && (
              <button
                className={classes(
                  controlPrimitiveStyles.buttonBase,
                  controlPrimitiveStyles.buttonTertiary,
                  styles.topbarButton,
                )}
                onClick={() => setPresetsOpen(true)}
                title='subpatch library'
              >
                presets
              </button>
            )}

            {/* separator dot */}
            <span className={styles.separator}>·</span>

            {/* undo */}
            <button
              className={classes(
                controlPrimitiveStyles.buttonBase,
                controlPrimitiveStyles.buttonTertiary,
                styles.topbarButton,
                styles.historyButton,
                pastLength === 0 && styles.historyButtonDisabled,
              )}
              onClick={() => useStore.getState().undo()}
              disabled={pastLength === 0}
              title='undo (cmd+z)'
            >
              ↩
            </button>

            {/* redo */}
            <button
              className={classes(
                controlPrimitiveStyles.buttonBase,
                controlPrimitiveStyles.buttonTertiary,
                styles.topbarButton,
                styles.historyButton,
                futureLength === 0 && styles.historyButtonDisabled,
              )}
              onClick={() => useStore.getState().redo()}
              disabled={futureLength === 0}
              title='redo (cmd+shift+z)'
            >
              ↪
            </button>

            {/* separator dot */}
            <span className={styles.separator}>·</span>

            {/* zoom indicator — click to reset */}
            <button
              className={classes(
                controlPrimitiveStyles.buttonBase,
                controlPrimitiveStyles.buttonTertiary,
                styles.topbarButton,
              )}
              onClick={() => setZoom(1)}
              title='click to reset zoom'
            >
              {Math.round(zoom * 100)}%
            </button>

            {/* spacer */}
            <div className={styles.spacer} />

            {/* hint */}
            <span className={styles.hint}>space to add modules</span>

            {!isInsideSubpatch && (
              <button
                className={classes(
                  controlPrimitiveStyles.buttonBase,
                  controlPrimitiveStyles.buttonTertiary,
                  styles.topbarButton,
                )}
                data-tutorial-launch=''
                onClick={() => {
                  if (settingsPanelOpen) setSettingsPanelOpen(false)
                  setTutorialPanelOpen(!tutorialPanelOpen)
                }}
                title='guided tutorials'
              >
                tutorials
              </button>
            )}

            {/* settings gear */}
            <button
              className={classes(
                controlPrimitiveStyles.buttonBase,
                controlPrimitiveStyles.buttonTertiary,
                styles.topbarButton,
                // styles.settingsButton,
              )}
              onClick={() => {
                if (tutorialPanelOpen) setTutorialPanelOpen(false)
                setSettingsPanelOpen(!settingsPanelOpen)
              }}
              title='settings'
            >
              {/* &#9881; */}
              settings
            </button>
          </div>

          <Rack />
          {commandPaletteOpen && <CommandPalette />}
          {presetsOpen && (
            <PresetsModal onClose={() => setPresetsOpen(false)} />
          )}
          <SettingsPanel />
          <TutorialOverlay />
        </>
      )}
    </ThemeProvider>
  )
}
