import { useStore } from '../../store'
import { getModule } from '../registry'
import { Knob } from '../../components/Knob'
import { Fader } from '../../components/Fader'

interface MixerPanelProps {
  moduleId: string
}

export function MixerPanel({ moduleId }: MixerPanelProps) {
  const mod = useStore((s) => s.modules[moduleId])
  const def = mod ? getModule(mod.definitionId) : undefined

  if (!mod || !def) return null

  const paramEntries = Object.entries(def.params)

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: 8,
        padding: '6px 4px',
        overflow: 'hidden',
      }}
    >
      {paramEntries.map(([paramId, paramDef]) => {
        if (paramId !== 'master') {
          return (
            <Fader
              key={paramId}
              moduleId={moduleId}
              paramId={paramId}
              definition={paramDef}
              value={mod.params[paramId] ?? paramDef.default}
              orientation='vertical'
              length={56}
            />
          )
        }

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
  )
}
