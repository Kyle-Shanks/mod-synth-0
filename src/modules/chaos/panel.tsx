import { useStore } from '../../store'
import { getModule } from '../registry'
import { Knob } from '../../components/Knob'
import styles from './panel.module.css'

interface ChaosPanelProps {
  moduleId: string
}

const PARAM_ORDER = ['speed', 'sigma', 'rho', 'beta', 'scale'] as const

export function ChaosPanel({ moduleId }: ChaosPanelProps) {
  const mod = useStore((s) => s.modules[moduleId])
  const def = mod ? getModule(mod.definitionId) : undefined

  if (!mod || !def) return null

  return (
    <div className={styles.root}>
      <div className={styles.title}>
        lorenz
      </div>
      <div className={styles.controls}>
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
