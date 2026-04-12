import type { PointerEventHandler } from 'react'
import { classes } from '../utils/classes'
import styles from './ModuleSquareButton.module.css'

type ModuleSquareButtonVariant = 'default' | 'mute'

interface ModuleSquareButtonProps {
  pressed: boolean
  ariaLabel: string
  variant?: ModuleSquareButtonVariant
  showOverlayWhenPressed?: boolean
  onPointerDown?: PointerEventHandler<HTMLDivElement>
  onPointerUp?: PointerEventHandler<HTMLDivElement>
  onPointerLeave?: PointerEventHandler<HTMLDivElement>
  onPointerCancel?: PointerEventHandler<HTMLDivElement>
}

export function ModuleSquareButton({
  pressed,
  ariaLabel,
  variant = 'default',
  showOverlayWhenPressed = false,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
}: ModuleSquareButtonProps) {
  return (
    <div
      className={styles.button}
      data-pressed={pressed ? 'true' : 'false'}
      data-variant={variant}
      role='button'
      aria-pressed={pressed}
      aria-label={ariaLabel}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerCancel}
    >
      {pressed && showOverlayWhenPressed && <div className={styles.overlay} />}
      {pressed && (
        <div
          className={classes(
            styles.dot,
            variant === 'mute' ? styles.dotMute : styles.dotDefault,
          )}
        />
      )}
    </div>
  )
}
