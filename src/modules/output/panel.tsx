import { useStore } from '../../store'
import { getModule } from '../registry'
import { GainMeter } from '../../components/GainMeter'
import styles from './panel.module.css'

interface OutputPanelProps {
  moduleId: string
}

export function OutputPanel({ moduleId }: OutputPanelProps) {
  const mod = useStore((s) => s.modules[moduleId])
  const def = mod ? getModule(mod.definitionId) : undefined

  if (!mod || !def) return null

  return (
    <div className={styles.root}>
      <GainMeter moduleId={moduleId} />
    </div>
  )
}
