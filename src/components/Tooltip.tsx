import { useState, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { useStore } from '../store'
import { getModule } from '../modules/registry'
import { portPositionCache } from '../cables/PortPositionCache'
import type { PortType } from '../engine/types'
import { isSubpatchContainer, parseSubpatchPortId } from '../store/subpatchSlice'
import { classes } from '../utils/classes'
import styles from './Tooltip.module.css'

const TOOLTIP_DELAY = 300

// Human-readable type labels
const PORT_TYPE_STYLE: Record<PortType, { label: string }> = {
  audio:   { label: 'audio' },
  cv:      { label: 'cv' },
  gate:    { label: 'gate' },
  trigger: { label: 'trigger' },
}

// Expand short port labels to more descriptive names where sensible
function expandLabel(portId: string, rawLabel: string): string {
  const expansions: Record<string, string> = {
    'v/oct':  'pitch (v/oct)',
    'fm':     'fm input',
    'sin':    'sine out',
    'saw':    'sawtooth out',
    'pls':    'pulse out',
    'in':     'signal in',
    'out':    'signal out',
    'cv':     'cv input',
    'cut cv': 'cutoff cv',
    'res cv': 'resonance cv',
    'env':    'envelope cv',
    'gate':   'gate',
    'trig':   'trigger',
    'l':      'left in',
    'r':      'right in',
    'lv 1':   'level 1',
    'lv 2':   'level 2',
    'lv 3':   'level 3',
    'lv 4':   'level 4',
    'mstr':   'master level',
    'in 1':   'input 1',
    'in 2':   'input 2',
    'in 3':   'input 3',
    'in 4':   'input 4',
    'atk':    'attack',
    'dec':    'decay',
    'sus':    'sustain',
    'rel':    'release',
    'freq':   'frequency',
    'tune':   'fine tune',
    'width':  'pulse width',
    'cutoff': 'cutoff',
    'res':    'resonance',
    'mode':   'filter mode',
    'gain':   'gain',
    'vol':    'master volume',
    'time':   'time scale',
  }
  return expansions[rawLabel.toLowerCase()] ?? expansions[portId.toLowerCase()] ?? rawLabel
}

export function Tooltip() {
  const hoveredPortKey = useStore((s) => s.hoveredPortKey)
  const modules = useStore((s) => s.modules)
  const cables = useStore((s) => s.cables)
  const tooltipsEnabled = useStore((s) => s.tooltipsEnabled)
  const [activeKey, setActiveKey] = useState<string | null>(null)

  useEffect(() => {
    if (!hoveredPortKey || !tooltipsEnabled) return
    const timer = window.setTimeout(
      () => setActiveKey(hoveredPortKey),
      TOOLTIP_DELAY,
    )
    return () => window.clearTimeout(timer)
  }, [hoveredPortKey, tooltipsEnabled])

  if (!activeKey || !tooltipsEnabled || activeKey !== hoveredPortKey) return null

  const parts = activeKey.split(':')
  const moduleId = parts[0]
  const portId = parts[1]
  if (!moduleId || !portId) return null

  const mod = modules[moduleId]
  if (!mod) return null

  const definitions = useStore.getState().definitions

  // Resolve port label, type and direction — handles both regular modules and subpatch containers
  let portLabel: string
  let portType: PortType
  let direction: 'input' | 'output'

  if (isSubpatchContainer(mod)) {
    const def = definitions[mod.subpatchDefinitionId]
    if (!def) return null
    const parsed = parseSubpatchPortId(portId)
    if (!parsed.isSubpatchPort) return null
    const ports = parsed.direction === 'input' ? def.exposedInputs : def.exposedOutputs
    const exposed = ports[parsed.index]
    if (!exposed) return null
    portLabel = exposed.label
    portType = exposed.type
    direction = parsed.direction
  } else {
    const def = getModule(mod.definitionId)
    if (!def) return null
    const portDef = def.inputs[portId] ?? def.outputs[portId]
    if (!portDef) return null
    portLabel = portDef.label
    portType = portDef.type
    // proxy modules (subpatch-input/output) store the user-selected type in data.portType
    const dataType = mod.data?.portType
    if (dataType === 'audio' || dataType === 'cv' || dataType === 'gate' || dataType === 'trigger') {
      portType = dataType
    }
    direction = portId in def.inputs ? 'input' : 'output'
  }

  const typeStyle = PORT_TYPE_STYLE[portType]
  const isInput = direction === 'input'

  // count connections on this port
  const connections = Object.values(cables).filter((c) =>
    (c.from.moduleId === moduleId && c.from.portId === portId) ||
    (c.to.moduleId === moduleId && c.to.portId === portId),
  )

  // build connected-to descriptions
  const connectedLabels = connections.map((c) => {
    const otherId = isInput ? c.from.moduleId : c.to.moduleId
    const otherPortId = isInput ? c.from.portId : c.to.portId
    const otherMod = modules[otherId]
    if (otherMod && isSubpatchContainer(otherMod)) {
      const otherDef = definitions[otherMod.subpatchDefinitionId]
      if (otherDef) {
        const parsed = parseSubpatchPortId(otherPortId)
        if (parsed.isSubpatchPort) {
          const ports = parsed.direction === 'input' ? otherDef.exposedInputs : otherDef.exposedOutputs
          const exposed = ports[parsed.index]
          return `${otherDef.name} · ${exposed?.label ?? otherPortId}`
        }
      }
    }
    const otherDef = otherMod ? getModule(otherMod.definitionId) : undefined
    const otherPortDef = otherDef
      ? (otherDef.outputs[otherPortId] ?? otherDef.inputs[otherPortId])
      : undefined
    const modName = otherDef?.name ?? otherId
    const portLabelStr = otherPortDef?.label ?? otherPortId
    return `${modName} · ${portLabelStr}`
  })

  const pos = portPositionCache.get(moduleId, portId)
  if (!pos) return null

  const expandedLabel = expandLabel(portId, portLabel)
  const tooltipStyle = {
    left: `${pos.x}px`,
    top: `${pos.y - 8}px`,
  } as CSSProperties

  return (
    <div className={styles.tooltip} style={tooltipStyle}>
      {/* port name */}
      <div className={styles.title}>{expandedLabel}</div>

      {/* type badge + direction */}
      <div
        className={classes(
          styles.typeRow,
          connections.length > 0 && styles.typeRowWithConnections,
        )}
      >
        <span className={styles.typeBadge} data-port-type={portType}>
          {typeStyle?.label ?? portType}
        </span>
        <span className={styles.direction}>{direction}</span>
      </div>

      {/* connections list */}
      {connectedLabels.length > 0 && (
        <div className={styles.connections}>
          {connectedLabels.map((label, i) => (
            <div key={i} className={styles.connectionItem}>
              ↔ {label}
            </div>
          ))}
        </div>
      )}

    </div>
  )
}
