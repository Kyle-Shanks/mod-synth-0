import { darkTheme }      from './darkTheme'
import { lightTheme }     from './lightTheme'
import { synthwaveTheme } from './synthwaveTheme'
import type { Theme }     from './tokens'

export const themes: Record<string, Theme> = {
  dark:      darkTheme,
  light:     lightTheme,
  synthwave: synthwaveTheme,
}

export function getTheme(id: string): Theme {
  return themes[id] ?? darkTheme
}
