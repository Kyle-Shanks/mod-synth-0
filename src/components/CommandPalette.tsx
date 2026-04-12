import { useState, useRef, useEffect, useMemo } from 'react'
import { useStore } from '../store'
import { getAllModules } from '../modules/registry'
import type { ModuleDefinition } from '../engine/types'
import {
  incrementModuleUsageStat,
  loadModuleUsageStats,
  type ModuleUsageStats,
} from '../persistence/storage'
import { classes } from '../utils/classes'
import styles from './CommandPalette.module.css'
import modalBaseStyles from '../styles/modalBase.module.css'
import controlPrimitiveStyles from '../styles/controlPrimitives.module.css'

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

const CATEGORY_LABELS: Record<(typeof CATEGORY_ORDER)[number], string> = {
  subpatch: 'subpatch',
  source: 'source',
  control: 'control',
  envelope: 'envelope',
  filter: 'filter',
  dynamics: 'dynamics',
  fx: 'fx',
  utility: 'utility',
  display: 'display',
}

const COMMON_MODULE_IDS = [
  'output',
  'vco',
  'vca',
  'vcf',
  'adsr',
  'lfo',
  'clock',
  'sequencer',
  'mixer',
  'reverb',
  'delay',
  'scope',
  'keyboard',
  'cv',
  'mult',
  'attenuverter',
  'quantizer',
  'samplehold',
  '__add_subpatch__',
] as const

type PaletteTab =
  | 'common'
  | 'most-used'
  | 'all'
  | (typeof CATEGORY_ORDER)[number]

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
  const [activeTab, setActiveTab] = useState<PaletteTab>('all')
  const [usageStats, setUsageStats] = useState<ModuleUsageStats>(() =>
    loadModuleUsageStats(),
  )
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [hoverEnabled, setHoverEnabled] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  // filter module list: hide internal modules at root; show them only inside a subpatch
  // at root, add synthetic 'subpatch' entry
  const allModules = useMemo(
    () =>
      getAllModules()
        .filter((m) => {
          if (m.internal) return isInsideSubpatch
          return true
        })
        .concat(isInsideSubpatch ? [] : [SUBPATCH_ENTRY]),
    [isInsideSubpatch],
  )

  const modulesById = useMemo(
    () => new Map(allModules.map((m) => [m.id, m])),
    [allModules],
  )

  const commonModules = useMemo(
    () =>
      COMMON_MODULE_IDS.map((id) => modulesById.get(id)).filter(
        (m): m is ModuleDefinition => !!m,
      ),
    [modulesById],
  )

  const hasUsageData = useMemo(
    () => allModules.some((m) => (usageStats[m.id] ?? 0) > 0),
    [allModules, usageStats],
  )

  const mostUsedModules = useMemo(() => {
    const used = allModules
      .filter((m) => (usageStats[m.id] ?? 0) > 0)
      .sort((a, b) => {
        const diff = (usageStats[b.id] ?? 0) - (usageStats[a.id] ?? 0)
        if (diff !== 0) return diff
        return a.name.localeCompare(b.name)
      })
    return used.length > 0 ? used : commonModules
  }, [allModules, usageStats, commonModules])

  const tabs = useMemo(() => {
    const out: Array<{ id: PaletteTab; label: string }> = [
      { id: 'all', label: 'all' },
      { id: 'common', label: 'common' },
      { id: 'most-used', label: 'most used' },
    ]
    for (const category of CATEGORY_ORDER) {
      if (!allModules.some((m) => m.category === category)) continue
      out.push({ id: category, label: CATEGORY_LABELS[category] })
    }
    return out
  }, [allModules])

  const effectiveActiveTab: PaletteTab = tabs.some(
    (tab) => tab.id === activeTab,
  )
    ? activeTab
    : (tabs[0]?.id ?? 'all')

  const normalizedQuery = query.trim().toLowerCase()
  const isSearching = normalizedQuery.length > 0

  const tabModules = useMemo(() => {
    if (effectiveActiveTab === 'common') return commonModules
    if (effectiveActiveTab === 'most-used') return mostUsedModules
    if (effectiveActiveTab === 'all') {
      return CATEGORY_ORDER.flatMap((cat) =>
        allModules
          .filter((m) => m.category === cat)
          .sort((a, b) => a.name.localeCompare(b.name)),
      )
    }
    return allModules
      .filter((m) => m.category === effectiveActiveTab)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [effectiveActiveTab, allModules, commonModules, mostUsedModules])

  // flat list of selectable modules (used for keyboard nav)
  const selectableModules: ModuleDefinition[] = useMemo(() => {
    if (isSearching) {
      return allModules
        .filter((m) => {
          return (
            m.name.toLowerCase().includes(normalizedQuery) ||
            m.category.toLowerCase().includes(normalizedQuery) ||
            m.id.toLowerCase().includes(normalizedQuery)
          )
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    }
    return tabModules
  }, [allModules, isSearching, normalizedQuery, tabModules])

  // display items — interleave category headers for "all" when not filtering
  const displayItems: DisplayItem[] = useMemo(() => {
    if (isSearching || effectiveActiveTab !== 'all') {
      return selectableModules.map((mod, i) => ({
        kind: 'module',
        mod,
        flatIndex: i,
      }))
    }
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
  }, [isSearching, effectiveActiveTab, selectableModules, allModules])

  // focus input on mount
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const maxIndex = Math.max(0, selectableModules.length - 1)
  const clampedSelectedIndex = Math.min(selectedIndex, maxIndex)

  useEffect(() => {
    const container = resultsRef.current
    if (!container) return
    const row = container.querySelector<HTMLElement>(
      `[data-module-index="${clampedSelectedIndex}"]`,
    )
    if (!row) return
    row.scrollIntoView({ block: 'nearest' })
  }, [clampedSelectedIndex, selectableModules.length])

  function handleSelect(definitionId: string) {
    const pos = position ?? { x: 2, y: 2 }
    setUsageStats(incrementModuleUsageStat(definitionId))
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
        setHoverEnabled(false)
        setHoveredIndex(null)
        setSelectedIndex((i) => Math.min(i + 1, maxIndex))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHoverEnabled(false)
        setHoveredIndex(null)
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

  function rowMeta(mod: ModuleDefinition): string | null {
    if (isSearching) return mod.category
    if (effectiveActiveTab === 'common') return mod.category
    if (effectiveActiveTab === 'most-used') {
      if (!hasUsageData) return mod.category
      return `${usageStats[mod.id] ?? 0}x`
    }
    return null
  }

  return (
    <div
      className={modalBaseStyles.overlayBase}
      onMouseDown={() => setOpen(false)}
    >
      <div
        className={modalBaseStyles.modalBase}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* input */}
        <div className={modalBaseStyles.inputRowBase}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setHoverEnabled(true)
              setHoveredIndex(null)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder='add module...'
            className={modalBaseStyles.inputBase}
          />
        </div>

        <div
          className={styles.tabs}
          role='tablist'
          aria-label='module categories'
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type='button'
              role='tab'
              aria-selected={tab.id === effectiveActiveTab}
              onClick={() => {
                setActiveTab(tab.id)
                setHoverEnabled(true)
                setHoveredIndex(null)
                setSelectedIndex(0)
                requestAnimationFrame(() => inputRef.current?.focus())
              }}
              className={classes(
                controlPrimitiveStyles.buttonBase,
                tab.id === effectiveActiveTab
                  ? controlPrimitiveStyles.buttonPrimary
                  : controlPrimitiveStyles.buttonSecondary,
                styles.tabButton,
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* results */}
        <div
          ref={resultsRef}
          className={modalBaseStyles.resultsBase}
          onMouseLeave={() => setHoveredIndex(null)}
          onMouseMove={(e) => {
            if (!hoverEnabled) setHoverEnabled(true)
            const target = e.target as HTMLElement
            const row = target.closest<HTMLElement>('[data-module-index]')
            if (!row) return
            const raw = row.getAttribute('data-module-index')
            if (!raw) return
            const index = Number(raw)
            if (!Number.isFinite(index)) return
            if (hoveredIndex === index) return
            setHoveredIndex(index)
            setSelectedIndex(index)
          }}
        >
          {!isSearching &&
            effectiveActiveTab === 'most-used' &&
            !hasUsageData && (
              <div className={styles.helperText}>
                no usage data yet — showing common starters
              </div>
            )}
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
                data-module-index={item.flatIndex}
                onMouseEnter={() => {
                  if (!hoverEnabled) return
                  setHoveredIndex(item.flatIndex)
                  setSelectedIndex(item.flatIndex)
                }}
                onClick={() => handleSelect(item.mod.id)}
                className={classes(
                  styles.moduleRow,
                  hoveredIndex === item.flatIndex && styles.moduleRowHover,
                  hoveredIndex === null &&
                    item.flatIndex === clampedSelectedIndex &&
                    styles.moduleRowActive,
                )}
              >
                <span className={styles.moduleName}>{item.mod.name}</span>
                {rowMeta(item.mod) && (
                  <span className={styles.moduleMeta}>{rowMeta(item.mod)}</span>
                )}
              </div>
            ),
          )}
          {selectableModules.length === 0 && (
            <div className={modalBaseStyles.emptyStateBase}>
              no modules found
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
