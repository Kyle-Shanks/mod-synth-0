import { useStore } from '../../store'
import { getModule } from '../registry'
import { GainMeter } from '../../components/GainMeter'

interface OutputPanelProps {
  moduleId: string
}

export function OutputPanel({ moduleId }: OutputPanelProps) {
  const mod = useStore((s) => s.modules[moduleId])
  const def = mod ? getModule(mod.definitionId) : undefined

  if (!mod || !def) return null

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
        padding: '6px 4px',
      }}
    >
      <GainMeter moduleId={moduleId} />
    </div>
  )
}
