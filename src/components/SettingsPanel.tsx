import { useStore } from '../store'
import { themes } from '../theme/themeRegistry'
import { classes } from '../utils/classes'
import styles from './SettingsPanel.module.css'
import controlPrimitiveStyles from '../styles/controlPrimitives.module.css'
import floatingPanelBaseStyles from '../styles/floatingPanelBase.module.css'

export function SettingsPanel() {
  const open = useStore((s) => s.settingsPanelOpen)
  const setOpen = useStore((s) => s.setSettingsPanelOpen)
  const tautness = useStore((s) => s.cableTautness)
  const setCableTautness = useStore((s) => s.setCableTautness)
  const tooltipsEnabled = useStore((s) => s.tooltipsEnabled)
  const setTooltipsEnabled = useStore((s) => s.setTooltipsEnabled)
  const themeId = useStore((s) => s.themeId)
  const setTheme = useStore((s) => s.setTheme)

  if (!open) return null

  return (
    <div
      className={classes(floatingPanelBaseStyles.panelBase, styles.panel)}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className={floatingPanelBaseStyles.headerRowBase}>
        <div className={styles.header}>settings</div>
        <button
          className={classes(
            controlPrimitiveStyles.buttonBase,
            controlPrimitiveStyles.buttonTertiary,
            styles.linkButton,
          )}
          onClick={() => setOpen(false)}
          type='button'
        >
          close
        </button>
      </div>

      <div className={floatingPanelBaseStyles.contentBase}>
        {/* cable tautness */}
        <div className={floatingPanelBaseStyles.sectionBase}>
          <div className={classes(floatingPanelBaseStyles.rowBase, styles.row)}>
            <span>cable tautness</span>
            <span className={styles.valueText}>{tautness.toFixed(2)}</span>
          </div>
          <input
            type='range'
            min={0}
            max={1}
            step={0.05}
            value={tautness}
            onChange={(e) => setCableTautness(parseFloat(e.target.value))}
            className={styles.slider}
          />
          <div className={styles.sliderLegend}>
            <span>loose</span>
            <span>taut</span>
          </div>
        </div>

        {/* tooltips toggle */}
        <div className={classes(floatingPanelBaseStyles.rowBase, styles.row)}>
          <span>tooltips</span>
          <div
            onClick={() => setTooltipsEnabled(!tooltipsEnabled)}
            className={styles.toggle}
            data-enabled={tooltipsEnabled}
          >
            <div className={styles.toggleThumb} />
          </div>
        </div>

        {/* theme selector */}
        <div className={classes(floatingPanelBaseStyles.rowBase, styles.row)}>
          <span>theme</span>
          <select
            value={themeId}
            onChange={(e) => setTheme(e.target.value)}
            className={`${controlPrimitiveStyles.panelInputBase} ${styles.select}`}
          >
            {Object.entries(themes).map(([id, theme]) => (
              <option key={id} value={id}>
                {theme.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
