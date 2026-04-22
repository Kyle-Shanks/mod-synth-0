import { useStore } from '../store'
import { serializePatch, deserializePatch, validatePatchJson } from './serialization'
import type { SerializedPatch } from './serialization'

const STORAGE_KEY = 'modsynth0:patch'
const SETTINGS_KEY = 'modsynth0:settings'
const MODULE_USAGE_KEY = 'modsynth0:module-usage'
const DEBOUNCE_MS = 500

export type ModuleUsageStats = Record<string, number>

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

export function loadModuleUsageStats(): ModuleUsageStats {
  try {
    const raw = localStorage.getItem(MODULE_USAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const out: ModuleUsageStats = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== 'number') continue
      if (!Number.isFinite(value) || value <= 0) continue
      out[key] = Math.floor(value)
    }
    return out
  } catch {
    return {}
  }
}

export function incrementModuleUsageStat(definitionId: string): ModuleUsageStats {
  const next = { ...loadModuleUsageStats() }
  next[definitionId] = (next[definitionId] ?? 0) + 1
  try {
    localStorage.setItem(MODULE_USAGE_KEY, JSON.stringify(next))
  } catch {
    console.warn('failed to save module usage stats')
  }
  return next
}

/**
 * Restores a saved patch into the live store + engine.
 * Call after the engine is initialized.
 */
export function restoreSavedPatch(): boolean {
  const saved = loadPatchFromStorage()
  if (!saved) return false

  const { name, modules, cables, definitions, settings } = deserializePatch(saved)
  const store = useStore.getState()

  store.loadPatch(name, modules, cables, definitions)
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
  let idleTimer: number | null = null

  const scheduleSave = () => {
    if (typeof window.requestIdleCallback === 'function') {
      idleTimer = window.requestIdleCallback(
        () => {
          savePatchToStorage()
          idleTimer = null
        },
        { timeout: 250 },
      )
      return
    }
    savePatchToStorage()
  }

  const unsubscribe = useStore.subscribe(
    (state, prevState) => {
      // only save when patch-relevant data changes
      const changed =
        state.modules !== prevState.modules ||
        state.cables !== prevState.cables ||
        state.patchName !== prevState.patchName ||
        state.definitions !== prevState.definitions ||
        state.cableTautness !== prevState.cableTautness ||
        state.tooltipsEnabled !== prevState.tooltipsEnabled ||
        state.themeId !== prevState.themeId

      if (!changed) return

      if (timer) clearTimeout(timer)
      if (idleTimer !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleTimer)
        idleTimer = null
      }
      timer = setTimeout(() => {
        scheduleSave()
        timer = null
      }, DEBOUNCE_MS)
    },
  )

  return () => {
    if (timer) clearTimeout(timer)
    if (idleTimer !== null && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(idleTimer)
      idleTimer = null
    }
    unsubscribe()
  }
}
