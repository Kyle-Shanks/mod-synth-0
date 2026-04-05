import { useStore } from '../../store'
import { getModule } from '../../modules/registry'
import { Knob } from '../Knob'
import { ListSelector } from '../ListSelector'

interface DefaultModuleBodyPanelProps {
  moduleId: string
}

export function DefaultModuleBodyPanel({ moduleId }: DefaultModuleBodyPanelProps) {
  const mod = useStore((s) => s.modules[moduleId])
  const def = mod ? getModule(mod.definitionId) : undefined

  if (!mod || !def) return null

  const paramEntries = Object.entries(def.params)

  if (paramEntries.length === 0) {
    return <div style={{ flex: 1 }} />
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '6px 4px',
        overflow: 'hidden',
      }}
    >
      {paramEntries.map(([paramId, paramDef]) => {
        if (paramDef.type === 'select') {
          return (
            <ListSelector
              key={paramId}
              moduleId={moduleId}
              paramId={paramId}
              definition={paramDef}
              value={mod.params[paramId] ?? paramDef.default}
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
