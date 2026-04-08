import { useStore } from '../../store'
import { ListSelector } from '../../components/ListSelector'
import { TextInput } from '../../components/TextInput'
import type { PortType } from '../../engine/types'

const PORT_TYPES: PortType[] = ['audio', 'cv', 'gate', 'trigger']

const TYPE_PARAM_DEF = {
  type: 'select' as const,
  default: 0,
  options: PORT_TYPES,
  label: 'type',
}

export function SubpatchInputPanel({ moduleId }: { moduleId: string }) {
  const setModuleDataValue = useStore((s) => s.setModuleDataValue)
  const subpatchContext = useStore((s) => s.subpatchContext)
  const defId = subpatchContext[subpatchContext.length - 1]?.definitionId ?? ''
  const definition = useStore((s) => s.definitions[defId])
  const internalMod = definition?.modules[moduleId]

  const label = (internalMod?.data?.['label'] as string | undefined) ?? 'in'
  const portType = (internalMod?.data?.['portType'] ?? 'audio') as PortType
  const selectedIndex = PORT_TYPES.indexOf(portType)

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '4px 6px',
      }}
    >
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
