import { ClockIndicator } from '../../components/ClockIndicator'
import { DefaultModuleBodyPanel } from '../../components/module-panels/DefaultModuleBodyPanel'

interface ClockDivPanelProps {
  moduleId: string
}

export function ClockDivPanel({ moduleId }: ClockDivPanelProps) {
  return (
    <>
      <ClockIndicator moduleId={moduleId} label='out' />
      <DefaultModuleBodyPanel moduleId={moduleId} />
    </>
  )
}
