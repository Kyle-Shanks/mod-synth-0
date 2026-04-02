import { useEffect, createContext, useContext, type ReactNode } from 'react'
import type { Theme } from './tokens'
import { darkTheme } from './darkTheme'

const ThemeContext = createContext<Theme>(darkTheme)

export function useTheme(): Theme {
  return useContext(ThemeContext)
}

export function ThemeProvider({ theme = darkTheme, children }: { theme?: Theme; children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--shade0', theme.shades.shade0)
    root.style.setProperty('--shade1', theme.shades.shade1)
    root.style.setProperty('--shade2', theme.shades.shade2)
    root.style.setProperty('--shade3', theme.shades.shade3)
    root.style.setProperty('--accent0', theme.accents.accent0)
    root.style.setProperty('--accent1', theme.accents.accent1)
    root.style.setProperty('--accent2', theme.accents.accent2)
    root.style.setProperty('--accent3', theme.accents.accent3)
    root.style.setProperty('--cable-audio', theme.cables.audio)
    root.style.setProperty('--cable-cv', theme.cables.cv)
    root.style.setProperty('--cable-gate', theme.cables.gate)
    root.style.setProperty('--cable-trigger', theme.cables.trigger)
  }, [theme])

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}
