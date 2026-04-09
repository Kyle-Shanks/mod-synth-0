import { useStore } from '../../store'
import { ListSelector } from '../../components/ListSelector'
import { TextInput } from '../../components/TextInput'
import type { PortType } from '../../engine/types'
import styles from '../shared/subpatchIoPanel.module.css'

const PORT_TYPES: PortType[] = ['audio', 'cv', 'gate', 'trigger']

const TYPE_PARAM_DEF = {
  type: 'select' as const,
  default: 0,
  options: PORT_TYPES,
  label: 'type',
}

export function SubpatchOutputPanel({ moduleId }: { moduleId: string }) {
  const setModuleDataValue = useStore((s) => s.setModuleDataValue)
  const subpatchContext = useStore((s) => s.subpatchContext)
  const defId = subpatchContext[subpatchContext.length - 1]?.definitionId ?? ''
  const definition = useStore((s) => s.definitions[defId])
  const internalMod = definition?.modules[moduleId]

  const label = (internalMod?.data?.['label'] as string | undefined) ?? 'out'
  const portType = (internalMod?.data?.['portType'] ?? 'audio') as PortType
  const selectedIndex = PORT_TYPES.indexOf(portType)

  return (
    <div className={styles.root}>
      <TextInput
        value={label}
        onChange={(v) => setModuleDataValue(moduleId, 'label', v)}
        placeholder='label'
      />
      <ListSelector
        moduleId={moduleId}
        paramId='portType'
        definition={TYPE_PARAM_DEF}
        value={selectedIndex < 0 ? 0 : selectedIndex}
        onChangeOverride={(i) => setModuleDataValue(moduleId, 'portType', PORT_TYPES[i] ?? 'audio')}
      />
    </div>
  )
}
