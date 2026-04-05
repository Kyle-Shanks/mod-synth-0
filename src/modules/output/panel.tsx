import { useStore } from '../../store'
import { getModule } from '../registry'
import { GainMeter } from '../../components/GainMeter'
import { Knob } from '../../components/Knob'

interface OutputPanelProps {
  moduleId: string
}

export function OutputPanel({ moduleId }: OutputPanelProps) {
  const mod = useStore((s) => s.modules[moduleId])
  const def = mod ? getModule(mod.definitionId) : undefined

  if (!mod || !def) return null

  const paramEntries = Object.entries(def.params)

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '6px 4px',
      }}
    >
      <GainMeter moduleId={moduleId} />
      {paramEntries.map(([paramId, paramDef]) => (
        <Knob
          key={paramId}
          moduleId={moduleId}
          paramId={paramId}
          definition={paramDef}
          value={mod.params[paramId] ?? paramDef.default}
        />
      ))}
    </div>
  )
}
