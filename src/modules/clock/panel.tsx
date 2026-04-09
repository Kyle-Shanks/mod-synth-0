import { useStore } from '../../store'
import { getModule } from '../registry'
import { Knob } from '../../components/Knob'
import { ListSelector } from '../../components/ListSelector'
import { ClockIndicator } from '../../components/ClockIndicator'
import styles from '../shared/defaultBodyPanel.module.css'

interface ClockPanelProps {
  moduleId: string
}

export function ClockPanel({ moduleId }: ClockPanelProps) {
  const mod = useStore((s) => s.modules[moduleId])
  const def = mod ? getModule(mod.definitionId) : undefined

  if (!mod || !def) return null

  const paramEntries = Object.entries(def.params)

  return (
    <>
      <ClockIndicator moduleId={moduleId} />
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
