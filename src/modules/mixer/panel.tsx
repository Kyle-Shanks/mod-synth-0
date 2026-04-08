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

  const channels = [
    { levelParamId: 'level1', muteParamId: 'mute1', meterLeftId: 'ch1L', meterRightId: 'ch1R', label: '1' },
    { levelParamId: 'level2', muteParamId: 'mute2', meterLeftId: 'ch2L', meterRightId: 'ch2R', label: '2' },
    { levelParamId: 'level3', muteParamId: 'mute3', meterLeftId: 'ch3L', meterRightId: 'ch3R', label: '3' },
    { levelParamId: 'level4', muteParamId: 'mute4', meterLeftId: 'ch4L', meterRightId: 'ch4R', label: '4' },
  ] as const
  const masterDef = def.params.master
  const masterMuteDef = def.params.masterMute
  const masterMuted = (mod.params.masterMute ?? masterMuteDef?.default ?? 0) >= 0.5

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
        {channels.map((channel) => {
          const paramDef = def.params[channel.levelParamId]
          const muteDef = def.params[channel.muteParamId]
          if (!paramDef) return null
          const muted =
            (mod.params[channel.muteParamId] ?? muteDef?.default ?? 0) >= 0.5

          return (
            <MixerInputStrip
              key={channel.levelParamId}
              moduleId={moduleId}
              paramId={channel.levelParamId}
              definition={paramDef}
              value={mod.params[channel.levelParamId] ?? paramDef.default}
              muteParamId={channel.muteParamId}
              muted={muted}
              meterLeftId={channel.meterLeftId}
              meterRightId={channel.meterRightId}
              label={channel.label}
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
          muteParamId='masterMute'
          muted={masterMuted}
        />
      )}
    </div>
  )
}
