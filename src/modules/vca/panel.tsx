import { useStore } from '../../store'
import { getModule } from '../registry'
import { Knob } from '../../components/Knob'
import { MonoGainMeter } from '../../components/MonoGainMeter'

interface VCAPanelProps {
  moduleId: string
}

export function VCAPanel({ moduleId }: VCAPanelProps) {
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
        gap: 10,
        padding: '6px 6px',
      }}
    >
      <MonoGainMeter moduleId={moduleId} portId='out' label='out' />
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
