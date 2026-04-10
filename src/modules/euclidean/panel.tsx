import { ClockIndicator } from '../../components/ClockIndicator'
import { DefaultModuleBodyPanel } from '../../components/module-panels/DefaultModuleBodyPanel'

interface EuclideanPanelProps {
  moduleId: string
}

export function EuclideanPanel({ moduleId }: EuclideanPanelProps) {
  return (
    <>
      <ClockIndicator moduleId={moduleId} label='out' />
      <DefaultModuleBodyPanel moduleId={moduleId} />
    </>
  )
}
