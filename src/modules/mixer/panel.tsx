import { useStore } from '../../store'
import { getModule } from '../registry'
import { MixerInputStrip } from '../../components/MixerInputStrip'
import { MixerMasterFader } from '../../components/MixerMasterFader'

interface MixerPanelProps {
  moduleId: string
}

export function MixerPanel({ moduleId }: MixerPanelProps) {
  const mod = useStore((s) => s.modules[moduleId])
  const def = mod ? getModule(mod.definitionId) : undefined

  if (!mod || !def) return null

  const levelParamIds = ['level1', 'level2', 'level3', 'level4'] as const
  const masterDef = def.params.master

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: 10,
        padding: '4px 4px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 6,
        }}
      >
        {levelParamIds.map((paramId, idx) => {
          const paramDef = def.params[paramId]
          if (!paramDef) return null

          return (
            <MixerInputStrip
              key={paramId}
              moduleId={moduleId}
              paramId={paramId}
              definition={paramDef}
              value={mod.params[paramId] ?? paramDef.default}
              meterLeftId={`ch${idx + 1}L`}
              meterRightId={`ch${idx + 1}R`}
              label={`${idx + 1}`}
            />
          )
        })}
      </div>
      {masterDef && (
        <MixerMasterFader
          moduleId={moduleId}
          paramId='master'
          definition={masterDef}
          value={mod.params.master ?? masterDef.default}
        />
      )}
    </div>
  )
}
