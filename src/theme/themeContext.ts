import { createContext, useContext } from 'react'
import type { Theme } from './tokens'
import { darkTheme } from './darkTheme'

export const ThemeContext = createContext<Theme>(darkTheme)

export function useTheme(): Theme {
  return useContext(ThemeContext)
}
