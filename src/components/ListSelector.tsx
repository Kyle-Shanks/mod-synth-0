import { useStore } from '../store'
import type { ParamDefinition } from '../engine/types'
import { classes } from '../utils/classes'
import styles from './ListSelector.module.css'

interface ListSelectorProps {
  moduleId: string
  paramId: string
  definition: ParamDefinition
  value: number
  // optional override: if provided, called instead of setParam (index passed as argument)
  onChangeOverride?: (index: number) => void
}

export function ListSelector({
  moduleId,
  paramId,
  definition,
  value,
  onChangeOverride,
}: ListSelectorProps) {
  const setParam = useStore((s) => s.setParam)
  const options = definition.options ?? []
  const selectedIndex = Math.round(value)

  return (
    <div
      className={styles.root}
      data-param-control=''
      data-module-id={moduleId}
      data-param-id={paramId}
    >
      <div className={styles.label}>{definition.label}</div>
      {options.map((option, i) => (
        <div
          key={option}
          onClick={(e) => {
            e.stopPropagation()
            if (onChangeOverride) {
              onChangeOverride(i)
            } else {
              useStore.getState().stageHistory()
              setParam(moduleId, paramId, i)
              useStore.getState().commitHistory()
            }
          }}
          className={classes(
            styles.option,
            i === selectedIndex && styles.optionSelected,
          )}
        >
          {option}
        </div>
      ))}
    </div>
  )
}
