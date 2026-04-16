import { useEffect } from 'react'
import { classes } from '../utils/classes'
import styles from './FirstOpenModal.module.css'
import controlPrimitiveStyles from '../styles/controlPrimitives.module.css'
import modalBaseStyles from '../styles/modalBase.module.css'

interface FirstOpenModalProps {
  onStartTutorials: () => void
  onClose: () => void
}

export function FirstOpenModal({
  onStartTutorials,
  onClose,
}: FirstOpenModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className={classes(modalBaseStyles.overlayBase, styles.overlay)}
      onMouseDown={onClose}
    >
      <div
        className={classes(modalBaseStyles.modalBase, styles.modal)}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className={styles.title}>welcome to mod synth 0</h2>
        <p className={styles.body}>
          if you're new to modular synthesis, start with a guided lesson to
          build your first patch.
        </p>
        <p className={styles.body}>
          if you're already comfortable with modular, feel free to jump straight
          into the rack.
        </p>
        <div className={styles.actions}>
          <button
            type='button'
            className={classes(
              controlPrimitiveStyles.buttonBase,
              controlPrimitiveStyles.buttonPrimary,
            )}
            onClick={onStartTutorials}
          >
            i am new, open tutorials
          </button>
          <button
            type='button'
            className={classes(
              controlPrimitiveStyles.buttonBase,
              controlPrimitiveStyles.buttonSecondary,
            )}
            onClick={onClose}
          >
            jump into rack
          </button>
        </div>
        <p className={styles.footnote}>
          you can reopen tutorials any time from the top bar.
        </p>
      </div>
    </div>
  )
}
