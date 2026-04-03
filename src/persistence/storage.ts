import { useStore } from '../store'
import { serializePatch, deserializePatch, validatePatchJson } from './serialization'
import type { SerializedPatch } from './serialization'

const STORAGE_KEY = 'modsynth:patch'
const SETTINGS_KEY = 'modsynth:settings'
const DEBOUNCE_MS = 500

export function savePatchToStorage(): void {
  const state = useStore.getState()
  const patch = serializePatch(state)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patch))
  } catch {
    console.warn('failed to save patch to localStorage')
  }
}

export function loadPatchFromStorage(): SerializedPatch | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data: unknown = JSON.parse(raw)
    if (!validatePatchJson(data)) return null
    return data
  } catch {
    return null
  }
}

export function clearPatchStorage(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function saveSettingsToStorage(): void {
  const state = useStore.getState()
  const settings = {
    cableTautness: state.cableTautness,
    tooltipsEnabled: state.tooltipsEnabled,
    themeId: state.themeId,
  }
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    console.warn('failed to save settings to localStorage')
  }
}

export function loadSettingsFromStorage(): {
  cableTautness: number
  tooltipsEnabled: boolean
  themeId: string
} | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return null
    return JSON.parse(raw) as {
      cableTautness: number
      tooltipsEnabled: boolean
      themeId: string
    }
  } catch {
    return null
  }
}

/**
 * Restores a saved patch into the live store + engine.
 * Call after the engine is initialized.
 */
export function restoreSavedPatch(): boolean {
  const saved = loadPatchFromStorage()
  if (!saved) return false

  const { name, modules, cables, settings } = deserializePatch(saved)
  const store = useStore.getState()

  store.loadPatch(name, modules, cables)
  store.setCableTautness(settings.cableTautness)
  store.setTooltipsEnabled(settings.tooltipsEnabled)
  store.setTheme(settings.themeId)

  return true
}

/**
 * Sets up a debounced subscription that autosaves the patch
 * whenever modules, cables, params, positions, or settings change.
 * Returns an unsubscribe function.
 */
export function setupAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null

  const unsubscribe = useStore.subscribe(
    (state, prevState) => {
      // only save when patch-relevant data changes
      const changed =
        state.modules !== prevState.modules ||
        state.cables !== prevState.cables ||
        state.patchName !== prevState.patchName ||
        state.cableTautness !== prevState.cableTautness ||
        state.tooltipsEnabled !== prevState.tooltipsEnabled ||
        state.themeId !== prevState.themeId

      if (!changed) return

      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        savePatchToStorage()
        timer = null
      }, DEBOUNCE_MS)
    },
  )

  return () => {
    if (timer) clearTimeout(timer)
    unsubscribe()
  }
}
