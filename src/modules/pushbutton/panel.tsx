import { PushButton } from '../../components/PushButton'
import styles from './panel.module.css'

interface PushButtonPanelProps {
  moduleId: string
}

export function PushButtonPanel({ moduleId }: PushButtonPanelProps) {
  return (
    <div className={styles.root}>
      <PushButton moduleId={moduleId} />
    </div>
  )
}
