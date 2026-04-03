import { useStore } from '../store'

export function SettingsPanel() {
  const open = useStore((s) => s.settingsPanelOpen)
  const setOpen = useStore((s) => s.setSettingsPanelOpen)
  const tautness = useStore((s) => s.cableTautness)
  const setCableTautness = useStore((s) => s.setCableTautness)
  const tooltipsEnabled = useStore((s) => s.tooltipsEnabled)
  const setTooltipsEnabled = useStore((s) => s.setTooltipsEnabled)

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 150,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'flex-end',
      }}
      onMouseDown={() => setOpen(false)}
    >
      <div
        style={{
          marginTop: 37,
          marginRight: 8,
          background: 'var(--shade1)',
          border: '1px solid var(--shade2)',
          borderRadius: 4,
          width: 240,
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          style={{
            fontSize: 'var(--text-md)',
            color: 'var(--shade3)',
            borderBottom: '1px solid var(--shade2)',
            paddingBottom: 8,
          }}
        >
          settings
        </div>

        {/* cable tautness */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 'var(--text-sm)',
              color: 'var(--shade3)',
            }}
          >
            <span>cable tautness</span>
            <span style={{ color: 'var(--shade2)' }}>
              {tautness.toFixed(2)}
            </span>
          </div>
          <input
            type='range'
            min={0}
            max={1}
            step={0.05}
            value={tautness}
            onChange={(e) => setCableTautness(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent0)' }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 'var(--text-xs)',
              color: 'var(--shade2)',
            }}
          >
            <span>loose</span>
            <span>taut</span>
          </div>
        </div>

        {/* tooltips toggle */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 'var(--text-sm)',
            color: 'var(--shade3)',
          }}
        >
          <span>tooltips</span>
          <div
            onClick={() => setTooltipsEnabled(!tooltipsEnabled)}
            style={{
              width: 32,
              height: 18,
              borderRadius: 9,
              background: tooltipsEnabled ? 'var(--accent0)' : 'var(--shade2)',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 150ms',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 2,
                left: tooltipsEnabled ? 16 : 2,
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: 'var(--shade3)',
                transition: 'left 150ms',
              }}
            />
          </div>
        </div>

        {/* theme placeholder */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 'var(--text-sm)',
            color: 'var(--shade2)',
          }}
        >
          <span>theme</span>
          <span>dark</span>
        </div>
      </div>
    </div>
  )
}
