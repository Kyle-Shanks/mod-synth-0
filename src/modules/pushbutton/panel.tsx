import { PushButton } from '../../components/PushButton'

interface PushButtonPanelProps {
  moduleId: string
}

export function PushButtonPanel({ moduleId }: PushButtonPanelProps) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <PushButton moduleId={moduleId} />
    </div>
  )
}
