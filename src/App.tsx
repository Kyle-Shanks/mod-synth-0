import { useEffect, useState } from 'react'
import { ThemeProvider } from './theme/ThemeProvider'
import { Rack } from './rack/Rack'
import { CommandPalette } from './components/CommandPalette'
import { engine } from './engine/EngineController'
import { useStore } from './store'
import './modules/registry' // ensure modules are registered

export default function App() {
  const [started, setStarted] = useState(false)
  const setEngineReady = useStore((s) => s.setEngineReady)

  useEffect(() => {
    engine.initialize().then(() => {
      setEngineReady(true)
    })
  }, [setEngineReady])

  async function handleStart() {
    await engine.resume()
    setStarted(true)
  }

  return (
    <ThemeProvider>
      {!started ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <button
            onClick={handleStart}
            style={{
              fontSize: 'var(--text-lg)',
              padding: '16px 40px',
              cursor: 'pointer',
              background: 'var(--accent0)',
              color: 'var(--shade0)',
              border: 'none',
              borderRadius: 4,
              fontFamily: 'var(--font)',
              fontWeight: 600,
              textTransform: 'lowercase',
              letterSpacing: 1,
            }}
          >
            start
          </button>
        </div>
      ) : (
        <>
          {/* top bar */}
          <div
            style={{
              height: 36,
              borderBottom: '1px solid var(--shade2)',
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
              gap: 12,
              flexShrink: 0,
              background: 'var(--shade1)',
            }}
          >
            <span
              style={{ fontSize: 'var(--text-sm)', color: 'var(--shade3)' }}
            >
              modular synth
            </span>
            <span
              style={{ fontSize: 'var(--text-xs)', color: 'var(--shade2)' }}
            >
              space / right-click to add modules
            </span>
          </div>

          <Rack />
          <CommandPalette />
        </>
      )}
    </ThemeProvider>
  )
}
