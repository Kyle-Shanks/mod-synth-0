import { useStore } from '../../store'
import { getModule } from '../registry'
import { Knob } from '../../components/Knob'

interface ChaosPanelProps {
  moduleId: string
}

const PARAM_ORDER = ['speed', 'sigma', 'rho', 'beta', 'scale'] as const

export function ChaosPanel({ moduleId }: ChaosPanelProps) {
  const mod = useStore((s) => s.modules[moduleId])
  const def = mod ? getModule(mod.definitionId) : undefined

  if (!mod || !def) return null

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        padding: '6px 4px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--shade2)',
          letterSpacing: '0.04em',
        }}
      >
        lorenz
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        {PARAM_ORDER.map((paramId) => {
          const paramDef = def.params[paramId]
          if (!paramDef) return null
          return (
            <Knob
              key={paramId}
              moduleId={moduleId}
              paramId={paramId}
              definition={paramDef}
              value={mod.params[paramId] ?? paramDef.default}
            />
          )
        })}
      </div>
    </div>
  )
}
