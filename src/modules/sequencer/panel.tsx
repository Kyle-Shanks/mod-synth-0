import { useStore } from '../../store'
import { getModule } from '../registry'
import { Knob } from '../../components/Knob'
import { Fader } from '../../components/Fader'
import { ListSelector } from '../../components/ListSelector'
import { SequencerIndicator } from '../../components/SequencerIndicator'

interface SequencerPanelProps {
  moduleId: string
}

export function SequencerPanel({ moduleId }: SequencerPanelProps) {
  const mod = useStore((s) => s.modules[moduleId])
  const def = mod ? getModule(mod.definitionId) : undefined

  if (!mod || !def) return null

  const paramEntries = Object.entries(def.params)
  const stepCount = Math.round(mod.params.steps ?? 8)

  return (
    <>
      <SequencerIndicator moduleId={moduleId} stepCount={stepCount} />
      {paramEntries.length > 0 ? (
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

            if (paramId.startsWith('step')) {
              return (
                <Fader
                  key={paramId}
                  moduleId={moduleId}
                  paramId={paramId}
                  definition={paramDef}
                  value={mod.params[paramId] ?? paramDef.default}
                  orientation='vertical'
                  length={48}
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
      ) : (
        <div style={{ flex: 1 }} />
      )}
    </>
  )
}
