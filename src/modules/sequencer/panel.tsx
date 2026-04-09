import { useStore } from '../../store'
import { getModule } from '../registry'
import { Knob } from '../../components/Knob'
import { Fader } from '../../components/Fader'
import { ListSelector } from '../../components/ListSelector'
import { SequencerIndicator } from '../../components/SequencerIndicator'
import styles from '../shared/defaultBodyPanel.module.css'

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
        <div className={styles.body}>
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
        <div className={styles.emptyBody} />
      )}
    </>
  )
}
