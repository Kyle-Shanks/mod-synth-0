import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { getModule } from '../modules/registry'
import { portPositionCache } from '../cables/PortPositionCache'
import type { PortType } from '../engine/types'

const TOOLTIP_DELAY = 300

// Human-readable type labels and their CSS var colors
const PORT_TYPE_STYLE: Record<PortType, { label: string; color: string }> = {
  audio:   { label: 'audio',   color: 'var(--cable-audio)' },
  cv:      { label: 'cv',      color: 'var(--cable-cv)' },
  gate:    { label: 'gate',    color: 'var(--cable-gate)' },
  trigger: { label: 'trigger', color: 'var(--cable-trigger)' },
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

  const def = getModule(mod.definitionId)
  if (!def) return null

  const portDef = def.inputs[portId] ?? def.outputs[portId]
  if (!portDef) return null

  const isInput = portId in def.inputs
  const direction = isInput ? 'input' : 'output'
  const typeStyle = PORT_TYPE_STYLE[portDef.type]

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
    const otherDef = otherMod ? getModule(otherMod.definitionId) : undefined
    const otherPortDef = otherDef
      ? (otherDef.outputs[otherPortId] ?? otherDef.inputs[otherPortId])
      : undefined
    const modName = otherDef?.name ?? otherId
    const portLabel = otherPortDef?.label ?? otherPortId
    return `${modName} · ${portLabel}`
  })

  const pos = portPositionCache.get(moduleId, portId)
  if (!pos) return null

  const expandedLabel = expandLabel(portId, portDef.label)

  return (
    <div
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y - 8,
        transform: 'translate(-50%, -100%)',
        background: 'var(--shade1)',
        border: '1px solid var(--shade2)',
        backdropFilter: 'blur(4px)',
        padding: '6px 8px',
        borderRadius: 3,
        pointerEvents: 'none',
        zIndex: 100,
        whiteSpace: 'nowrap',
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        minWidth: 120,
      }}
    >
      {/* port name */}
      <div style={{
        fontSize: 'var(--text-sm)',
        color: 'var(--shade3)',
        lineHeight: 1.4,
        marginBottom: 2,
      }}>
        {expandedLabel}
      </div>

      {/* type badge + direction */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: connections.length > 0 ? 4 : 0,
      }}>
        <span style={{
          fontSize: 'var(--text-xs)',
          color: typeStyle?.color ?? 'var(--shade3)',
          fontWeight: 600,
          lineHeight: 1,
        }}>
          {typeStyle?.label ?? portDef.type}
        </span>
        <span style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--shade2)',
          lineHeight: 1,
        }}>
          {direction}
        </span>
      </div>

      {/* connections list */}
      {connectedLabels.length > 0 && (
        <div style={{
          borderTop: '1px solid var(--shade2)',
          paddingTop: 4,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}>
          {connectedLabels.map((label, i) => (
            <div key={i} style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--shade3)',
              opacity: 0.7,
              lineHeight: 1.3,
            }}>
              ↔ {label}
            </div>
          ))}
        </div>
      )}

    </div>
  )
}
